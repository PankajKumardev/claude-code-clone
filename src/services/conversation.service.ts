import { prisma } from '../db/prisma';
import {
  BaseMessage,
  HumanMessage,
  AIMessage,
  ToolMessage,
} from '@langchain/core/messages';

export class ConversationService {
  /**
   * Create a new conversation
   */
  async createConversation(userId: string = 'default-user', title?: string) {
    try {
      const conversation = await prisma.conversation.create({
        data: {
          userId,
          title: title || `Conversation ${new Date().toISOString()}`,
        },
      });

      return conversation;
    } catch (error) {
      // Silent error handling - rethrow for caller to handle
      throw error;
    }
  }

  /**
   * Get a conversation by ID
   */
  async getConversation(id: string) {
    try {
      const conversation = await prisma.conversation.findUnique({
        where: { id },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
          },
          toolCalls: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      return conversation;
    } catch (error) {
      // Silent error handling - rethrow for caller to handle
      throw error;
    }
  }

  /**
   * Save messages to a conversation
   */
  async saveMessages(
    conversationId: string,
    messages: BaseMessage[]
  ): Promise<void> {
    try {
      const messageData = messages.map((message) => ({
        conversationId,
        role: this.mapMessageRole(message),
        content:
          typeof message.content === 'string'
            ? message.content
            : JSON.stringify(message.content),
        metadata: {
          tool_calls:
            message instanceof AIMessage ? message.tool_calls : undefined,
          tool_call_id:
            message instanceof ToolMessage ? message.tool_call_id : undefined,
          name: message instanceof ToolMessage ? message.name : undefined,
        },
      }));

      await prisma.message.createMany({
        data: messageData,
      });
    } catch (error) {
      // Silent error handling - rethrow for caller to handle
      throw error;
    }
  }

  /**
   * Save a tool execution
   */
  async saveToolExecution(
    conversationId: string,
    toolName: string,
    input: any,
    output: any,
    status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' = 'COMPLETED'
  ): Promise<void> {
    try {
      await prisma.toolExecution.create({
        data: {
          conversationId,
          toolName,
          input,
          output,
          status,
        },
      });
    } catch (error) {
      // Silent error handling - rethrow for caller to handle
      throw error;
    }
  }

  /**
   * Update conversation state
   */
  async updateState(
    conversationId: string,
    state: any,
    step: number
  ): Promise<void> {
    try {
      // Update conversation
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { state },
      });

      // Create checkpoint
      await prisma.stateCheckpoint.create({
        data: {
          conversationId,
          state,
          step,
        },
      });
    } catch (error) {
      // Silent error handling - rethrow for caller to handle
      throw error;
    }
  }

  /**
   * Map LangChain message types to Prisma enum
   */
  private mapMessageRole(message: BaseMessage): 'USER' | 'ASSISTANT' | 'TOOL' {
    if (message instanceof HumanMessage) {
      return 'USER';
    } else if (message instanceof AIMessage) {
      return 'ASSISTANT';
    } else if (message instanceof ToolMessage) {
      return 'TOOL';
    } else {
      return 'USER'; // Default fallback
    }
  }

  /**
   * Get conversation history as LangChain messages
   * @param conversationId - The conversation ID
   * @param limit - Maximum number of recent messages to retrieve (default: 20)
   */
  async getConversationMessages(
    conversationId: string,
    limit: number = 20
  ): Promise<BaseMessage[]> {
    try {
      const messages = await prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' }, // Get most recent first
        take: limit, // Limit the number of messages
      });

      // Reverse to get chronological order (oldest to newest)
      const chronologicalMessages = messages.reverse();

      return chronologicalMessages.map((msg) => {
        const metadata = msg.metadata as any;

        switch (msg.role) {
          case 'USER':
            return new HumanMessage(msg.content);
          case 'ASSISTANT':
            return new AIMessage({
              content: msg.content,
              tool_calls: metadata?.tool_calls,
            });
          case 'TOOL':
            return new ToolMessage({
              content: msg.content,
              tool_call_id: metadata?.tool_call_id,
              name: metadata?.name,
            });
          default:
            return new HumanMessage(msg.content);
        }
      });
    } catch (error) {
      // Silent error handling - return empty array
      return [];
    }
  }
}

// Export singleton instance
export const conversationService = new ConversationService();
