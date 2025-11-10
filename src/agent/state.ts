import { Annotation } from '@langchain/langgraph';
import { BaseMessage } from '@langchain/core/messages';

/**
 * Agent state annotation for the LangGraph state machine
 * Defines the structure of state that flows through the agent nodes
 */
export const AgentStateAnnotation = Annotation.Root({
  // Conversation history - messages are appended using a reducer
  messages: Annotation<BaseMessage[]>({
    reducer: (current, update) => current.concat(update),
    default: () => [],
  }),

  // Current conversation ID for database persistence
  conversationId: Annotation<string>({
    reducer: (current, update) => update,
    default: () => '',
  }),

  // Results from tool executions
  toolResults: Annotation<Record<string, any>>({
    reducer: (current, update) => ({ ...current, ...update }),
    default: () => ({}),
  }),

  // Flag to determine if the agent should continue processing
  shouldContinue: Annotation<boolean>({
    reducer: (current, update) => update,
    default: () => true,
  }),

  // Additional metadata and context
  metadata: Annotation<Record<string, any>>({
    reducer: (current, update) => ({ ...current, ...update }),
    default: () => ({}),
  }),
});

// Export the state type for use in nodes
export type AgentState = typeof AgentStateAnnotation.State;
