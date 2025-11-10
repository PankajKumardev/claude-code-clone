import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import { conversationService } from '../services/conversation.service';
import { geminiService } from '../services/gemini.service';
import { mcpService } from '../services/mcp.service';
import { AgentState } from './state';

/**
 * User Input Node - Processes user input and saves to database
 */
export async function userInputNode(
  state: AgentState
): Promise<Partial<AgentState>> {
  try {
    // Extract the latest user message from state
    const latestMessage = state.messages[state.messages.length - 1];

    if (latestMessage && latestMessage instanceof HumanMessage) {
      // Save the message to database
      await conversationService.saveMessages(state.conversationId, [
        latestMessage,
      ]);
    }

    return {};
  } catch (error) {
    // Silent error handling
    return {};
  }
}

/**
 * Model Node - Calls Gemini API to generate response and decide on tool usage
 */
export async function modelNode(
  state: AgentState
): Promise<Partial<AgentState>> {
  try {
    // Get available tools from MCP servers
    const availableTools = await mcpService.getAllTools();

    // Get working directory from metadata
    const workingDirectory = state.metadata?.workingDirectory || process.cwd();

    // Generate response from Gemini
    const response = await geminiService.generateResponse(
      state.messages,
      availableTools,
      workingDirectory
    );

    let newMessage: AIMessage;
    let shouldContinue = false;

    if (
      response.stop_reason === 'tool_use' &&
      response.function_calls &&
      response.function_calls.length > 0
    ) {
      // Extract tool calls from Gemini response
      const toolCalls = response.function_calls.map(
        (call: any, index: number) => ({
          id: `call_${Date.now()}_${index}`,
          type: 'function' as const,
          function: {
            name: call.name,
            arguments: JSON.stringify(call.args),
          },
        })
      );

      // Create AI message with tool calls
      newMessage = new AIMessage({
        content: response.content.length > 0 ? response.content[0].text : '',
        tool_calls: toolCalls,
      });

      shouldContinue = true;
    } else {
      // Create regular AI message
      const textContent =
        response.content.length > 0 ? response.content[0].text : '';

      newMessage = new AIMessage({ content: textContent });
      shouldContinue = false;
    }

    // Save the AI message to database
    await conversationService.saveMessages(state.conversationId, [newMessage]);

    return {
      messages: [newMessage],
      shouldContinue,
    };
  } catch (error) {
    // Return error message
    const errorMessage = new AIMessage({
      content: 'Sorry, I encountered an error while processing your request.',
    });

    await conversationService.saveMessages(state.conversationId, [
      errorMessage,
    ]);

    return {
      messages: [errorMessage],
      shouldContinue: false,
    };
  }
}

/**
 * Tool Use Node - Executes tools called by the model
 */
export async function toolUseNode(
  state: AgentState
): Promise<Partial<AgentState>> {
  try {
    const toolMessages: ToolMessage[] = [];
    const toolResults: Record<string, any> = {};

    // Get the last message (should be AI message with tool calls)
    const lastMessage = state.messages[state.messages.length - 1];

    if (lastMessage instanceof AIMessage && lastMessage.tool_calls) {
      // Process each tool call
      for (const toolCall of lastMessage.tool_calls) {
        try {
          // Type assertion to access function property
          const toolCallAny = toolCall as any;
          const toolName = toolCallAny.function?.name || '';
          const args = toolCallAny.function?.arguments
            ? JSON.parse(toolCallAny.function.arguments)
            : {};

          // Determine which MCP server to use based on tool name
          const serverName = mcpService.getServerForTool(toolName);

          if (!serverName) {
            throw new Error(`No server found for tool: ${toolName}`);
          }

          // Execute the tool
          const result = await mcpService.callTool(serverName, toolName, args);

          // Create tool message
          const toolMessage = new ToolMessage({
            content: JSON.stringify(result),
            tool_call_id: toolCallAny.id || '',
            name: toolName,
          });

          toolMessages.push(toolMessage);
          if (toolCallAny.id) {
            toolResults[toolCallAny.id] = result;
          }

          // Save tool execution to database
          await conversationService.saveToolExecution(
            state.conversationId,
            toolName,
            args,
            result,
            'COMPLETED'
          );
        } catch (error) {
          const errorObj = error as Error;
          const toolCallAny = toolCall as any;

          // Create error tool message
          const toolMessage = new ToolMessage({
            content: JSON.stringify({ error: errorObj.message }),
            tool_call_id: toolCallAny.id || '',
            name: toolCallAny.function?.name || '',
          });

          toolMessages.push(toolMessage);
          if (toolCallAny.id) {
            toolResults[toolCallAny.id] = { error: errorObj.message };
          }

          // Save failed tool execution to database
          await conversationService.saveToolExecution(
            state.conversationId,
            toolCallAny.function?.name || '',
            toolCallAny.function?.arguments
              ? JSON.parse(toolCallAny.function.arguments)
              : {},
            { error: errorObj.message },
            'FAILED'
          );
        }
      }
    }

    // Save tool messages to database
    if (toolMessages.length > 0) {
      await conversationService.saveMessages(
        state.conversationId,
        toolMessages
      );
    }

    return {
      messages: toolMessages,
      toolResults,
    };
  } catch (error) {
    // Silent error handling
    return {};
  }
}
