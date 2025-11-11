import { prisma } from '../db/prisma';
import {
  BaseMessage,
  HumanMessage,
  AIMessage,
  ToolMessage,
} from '@langchain/core/messages';

export class ConversationService {
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
      throw error;
    }
  }

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
      throw error;
    }
  }

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
      throw error;
    }
  }

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
      throw error;
    }
  }

  async updateState(
    conversationId: string,
    state: any,
    step: number
  ): Promise<void> {
    try {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { state },
      });

      await prisma.stateCheckpoint.create({
        data: {
          conversationId,
          state,
          step,
        },
      });
    } catch (error) {
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
      return 'USER'; 
    }
  }


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
      return [];
    }
  }
}

export const conversationService = new ConversationService();
