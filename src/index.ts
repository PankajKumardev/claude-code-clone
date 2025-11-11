import 'dotenv/config';
import chalk from 'chalk';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { graph } from './agent/graph';
import { conversationService } from './services/conversation.service';
import { mcpService } from './services/mcp.service';
import { webSearchService } from './services/web-search.service';
import { CLIInterface } from './cli/interface';

// Helper function to process user input
async function processUserInput(
  cli: CLIInterface,
  userInput: string,
  conversation: any,
  availableTools: any[]
) {
  // Handle commands
  if (userInput.toLowerCase() === '/exit') {
    cli.displayInfo('Goodbye! 👋');
    return 'exit';
  }

  if (userInput.toLowerCase() === '/help') {
    cli.displayHelp();
    return 'continue';
  }

  if (userInput.toLowerCase() === '/tools') {
    cli.displayTools(availableTools);
    return 'continue';
  }

  // Process user message through the agent
  cli.displayThinking();

  // Load previous conversation history from database (last 10 messages to stay within context limits)
  const conversationHistory = await conversationService.getConversationMessages(
    conversation.id,
    10
  );

  // Create initial state with conversation history + new message
  const initialState = {
    messages: [...conversationHistory, new HumanMessage(userInput)],
    conversationId: conversation.id,
    shouldContinue: true,
    toolResults: {},
    metadata: {
      workingDirectory: process.cwd(),
    },
  };

  // Run the graph with streaming to show tool executions
  const result = await graph.invoke(initialState);

  cli.stopThinking();

  // Find the final AI response (last AIMessage that's not empty)
  let finalResponse = '';
  for (let i = result.messages.length - 1; i >= 0; i--) {
    const msg = result.messages[i];
    if (
      msg instanceof AIMessage &&
      msg.content &&
      typeof msg.content === 'string' &&
      msg.content.trim().length > 0
    ) {
      finalResponse = msg.content;
      break;
    }
  }

  if (finalResponse) {
    cli.displayResponse(finalResponse);
  } else {
    cli.displayResponse(
      'I processed your request but have no response to show.'
    );
  }

  return 'continue';
}

async function main() {
  console.log(chalk.gray('Starting Claude Code Assistant...\n'));

  // Initialize CLI interface
  const cli = new CLIInterface();
  cli.displayWelcome();

  try {
    await conversationService.createConversation('system-test');
    console.log(chalk.hex('#CD6F47')('✓') + chalk.gray(' Database connected'));

    // Connect to MCP servers
    console.log(chalk.gray('Connecting to MCP servers...'));

    try {
      // Connect to filesystem server
      await mcpService.connectServer('filesystem', 'npx', [
        '-y',
        '@modelcontextprotocol/server-filesystem',
        process.cwd(),
      ]);
      console.log(chalk.hex('#CD6F47')('✓') + chalk.gray(' Filesystem server'));
    } catch (error) {
      const errorObj = error as Error;
      console.log(
        chalk.yellow('✗') +
          chalk.gray(' Filesystem server: ' + errorObj.message)
      );
    }

    try {
      // Connect to GitHub server (requires token)
      if (process.env.GITHUB_TOKEN) {
        await mcpService.connectServer('github', 'npx', [
          '-y',
          '@missionsquad/mcp-github',
        ]);
        console.log(chalk.hex('#CD6F47')('✓') + chalk.gray(' GitHub server'));
      } else {
        console.log(
          chalk.yellow('✗') + chalk.gray(' GitHub server (no token)')
        );
      }
    } catch (error) {
      const errorObj = error as Error;
      console.log(
        chalk.yellow('✗') + chalk.gray(' GitHub server: ' + errorObj.message)
      );
    }

    // Check web search availability (using Tavily SDK directly, not MCP)
    if (webSearchService.isAvailable()) {
      console.log(
        chalk.hex('#CD6F47')('✓') + chalk.gray(' Web search (Tavily)')
      );
    } else {
      console.log(
        chalk.yellow('○') +
          chalk.gray(' Web search (get free API key at https://tavily.com)')
      );
    }

    // List all available tools
    const availableTools = await mcpService.getAllTools();
    const webSearchToolCount = webSearchService.isAvailable() ? 1 : 0;
    console.log(
      chalk.gray(
        `\nReady with ${
          availableTools.length + webSearchToolCount
        } tools from ${mcpService.getConnectedServers().length} servers${
          webSearchToolCount ? ' + web search' : ''
        }\n`
      )
    );

    // Create a new conversation
    const conversation = await conversationService.createConversation('user');

    // Main interaction loop
    while (true) {
      try {
        // Get user input
        const userInput = await cli.promptUser();

        const result = await processUserInput(
          cli,
          userInput,
          conversation,
          availableTools
        );
        if (result === 'exit') {
          break;
        }
      } catch (error) {
        cli.stopThinking();
        const errorObj = error as Error;
        cli.displayError(`An error occurred: ${errorObj.message}`);
      }
    }
  } catch (error) {
    const errorObj = error as Error;
    cli.displayError(`Fatal error: ${errorObj.message}`);
    process.exit(1);
  } finally {
    console.log('Cleaning up...');
    try {
      await mcpService.disconnectAll();
      console.log('Disconnected from all MCP servers');
    } catch (error) {}
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  console.log('\nReceived SIGINT, shutting down gracefully...');
  try {
    await mcpService.disconnectAll();
  } catch (error) {}
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nReceived SIGTERM, shutting down gracefully...');
  try {
    await mcpService.disconnectAll();
  } catch (error) {}
  process.exit(0);
});

// Handle unhandled errors from MCP servers
process.on('uncaughtException', (error: Error) => {
  // Ignore EPIPE errors from MCP servers - they happen during normal shutdown
  if ('code' in error && error.code === 'EPIPE') {
    return;
  }
  process.exit(1);
});

process.on('unhandledRejection', (reason: any) => {
});

main().catch((error) => {
  process.exit(1);
});
