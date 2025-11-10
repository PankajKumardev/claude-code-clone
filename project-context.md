# Claude Code Assistant - Implementation Blueprint

## 🎯 What to Build
AI coding assistant using MCP servers, Claude API, LangGraph.js, Prisma + PostgreSQL in Node.js/TypeScript

---

## 📚 Documentation Links

**Core:**
- LangGraph.js: https://langchain-ai.github.io/langgraphjs/
- Claude API: https://docs.anthropic.com/en/docs/quickstart
- MCP Docs: https://modelcontextprotocol.io/
- MCP Servers: https://github.com/modelcontextprotocol/servers
- Prisma: https://www.prisma.io/docs/getting-started

---

## 🏗️ System Flow

```
User Input 
  ↓
CLI Interface
  ↓
LangGraph State Machine
  ├─ Input Node (save message)
  ├─ Model Node (Claude decides)
  └─ Tool Node (execute MCP tools)
      ↓ loop back to Model
  ↓
PostgreSQL (via Prisma)
  ↓
Response
```

---

## 📁 Project Structure

```
src/
├── agent/
│   ├── graph.ts       # State machine
│   ├── nodes.ts       # 3 nodes
│   └── state.ts       # State schema
├── services/
│   ├── claude.service.ts
│   ├── mcp.service.ts
│   └── conversation.service.ts
├── db/
│   └── prisma.ts
├── cli/
│   └── interface.ts
└── index.ts

prisma/
└── schema.prisma

.env
package.json
tsconfig.json
```

---

## 📦 Install Everything

```bash
npm install @langchain/langgraph @langchain/core @anthropic-ai/sdk @modelcontextprotocol/sdk @prisma/client chalk ora inquirer dotenv

npm install -D typescript tsx @types/node prisma
```

---

## 🗄️ Database Schema

**Prisma schema.prisma - 4 models:**

1. **Conversation**
   - id, userId, title, state (JSON), isActive, timestamps
   - Relations: messages[], toolCalls[]

2. **Message**
   - id, conversationId, role (USER/ASSISTANT/TOOL), content, metadata (JSON), timestamp
   - Relation: conversation

3. **ToolExecution**
   - id, conversationId, toolName, input (JSON), output (JSON), status, error, durationMs, timestamps
   - Relation: conversation

4. **StateCheckpoint**
   - id, conversationId, state (JSON), step, timestamp

---

## 🔧 What to Build

### 1. Agent Layer (LangGraph State Machine)

**src/agent/state.ts:**
- Import `Annotation` from `@langchain/langgraph`
- Define `AgentStateAnnotation` using `Annotation.Root()`
- Include fields:
  - `messages: BaseMessage[]` - conversation history (use reducer to append)
  - `conversationId: string` - current conversation ID
  - `toolResults: Record<string, any>` - tool execution results
  - `shouldContinue: boolean` - flag to continue or end
  - `metadata: Record<string, any>` - extra context
- Export type: `export type AgentState = typeof AgentStateAnnotation.State`

**src/agent/nodes.ts:**
Three async functions that accept `AgentState` and return `Partial<AgentState>`:

1. **userInputNode:**
   - Extract latest user message from state.messages
   - Call `conversationService.saveMessages()` to persist to DB
   - Return empty object `{}`

2. **modelNode:**
   - Call `claudeService.generateResponse(state.messages, tools)`
   - Check `response.stop_reason`:
     - If `"tool_use"`: Extract tool calls, create AIMessage with tool_calls, set `shouldContinue: true`
     - If `"end_turn"`: Create AIMessage with text content, set `shouldContinue: false`
   - Save messages to DB
   - Return: `{ messages: [newMessage], shouldContinue: boolean }`

3. **toolUseNode:**
   - Get last message from state.messages
   - Extract tool_calls from `message.additional_kwargs.tool_calls`
   - For each tool call:
     - Parse tool name and arguments
     - Call `mcpService.callTool(serverName, toolName, args)`
     - Create ToolMessage with result
     - Track in `toolResults` object
   - Save tool messages to DB
   - Return: `{ messages: toolMessages[], toolResults: {...} }`

**src/agent/edges.ts:**
- Create function `shouldContinueToTools(state: AgentState)`
- Return `"continue"` if `state.shouldContinue === true`, else return `"end"`

**src/agent/graph.ts:**
- Import `StateGraph, END` from `@langchain/langgraph`
- Create workflow: `new StateGraph(AgentStateAnnotation)`
- Add nodes: `workflow.addNode("userInput", userInputNode)` (same for other 2)
- Set entry: `workflow.setEntryPoint("userInput")`
- Add edges:
  - `workflow.addEdge("userInput", "model")`
  - `workflow.addConditionalEdges("model", shouldContinueToTools, { continue: "toolUse", end: END })`
  - `workflow.addEdge("toolUse", "model")`
- Compile and export: `export const graph = workflow.compile()`

---

### 2. Services Layer

**src/services/claude.service.ts:**
- Import `Anthropic` from `@anthropic-ai/sdk`
- Create singleton class `ClaudeService`
- Initialize: `this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })`
- Method: `async generateResponse(messages: BaseMessage[], tools: any[])`
  - Format messages: Convert LangChain messages to Anthropic format
    - `HumanMessage` → `{ role: "user", content: "..." }`
    - `AIMessage` → `{ role: "assistant", content: "..." }`
  - Call API: `await this.client.messages.create({ model: "claude-sonnet-4-20250514", max_tokens: 4096, messages, tools })`
  - Return full response object
- Export singleton: `export const claudeService = new ClaudeService()`

**src/services/mcp.service.ts:**
- Import `Client` from `@modelcontextprotocol/sdk/client/index.js`
- Import `StdioClientTransport` from `@modelcontextprotocol/sdk/client/stdio.js`
- Create class `MCPService`
- Store clients: `private clients = new Map<string, Client>()`
- Method: `async connectServer(name: string, command: string, args: string[])`
  - Create new Client with name and version
  - Create StdioClientTransport with command and args
  - Connect: `await client.connect(transport)`
  - Store: `this.clients.set(name, client)`
- Method: `async listTools(serverName: string)`
  - Get client from map
  - Call: `await client.listTools()`
  - Return tools array
- Method: `async callTool(serverName: string, toolName: string, args: any)`
  - Get client from map
  - Call: `await client.callTool({ name: toolName, arguments: args })`
  - Return result
- Method: `async disconnect(serverName: string)`
  - Get client, call `client.close()`, remove from map
- Export singleton

**src/services/conversation.service.ts:**
- Import prisma client
- Create class `ConversationService`
- Method: `async createConversation(userId: string, title?: string)`
  - Use: `prisma.conversation.create({ data: { userId, title } })`
  - Return conversation object
- Method: `async getConversation(id: string)`
  - Use: `prisma.conversation.findUnique({ where: { id }, include: { messages: true, toolCalls: true } })`
  - Return conversation with messages
- Method: `async saveMessages(conversationId: string, messages: BaseMessage[])`
  - Map messages to Prisma format (convert role types)
  - Use: `prisma.message.createMany({ data: messageData })`
- Method: `async updateState(conversationId: string, state: any, step: number)`
  - Create checkpoint: `prisma.stateCheckpoint.create({ data: { conversationId, state, step } })`
  - Update conversation: `prisma.conversation.update({ where: { id }, data: { state } })`
- Helper: `mapMessageRole(type: string)` - converts LangChain types to Prisma enum
- Export singleton

**src/db/prisma.ts:**
- Import `PrismaClient`
- Create singleton pattern:
  ```typescript
  const prisma = new PrismaClient()
  export { prisma }
  ```

---

### 3. CLI Interface

**src/cli/interface.ts:**
- Import chalk, ora, inquirer
- Create class `CLIInterface`
- Method: `displayWelcome()` - Show banner with chalk colors
- Method: `async promptUser()` - Use inquirer to get user input
- Method: `displayThinking()` - Show ora spinner while processing
- Method: `displayResponse(message: string)` - Format and show AI response
- Method: `displayToolExecution(toolName: string, status: string)` - Show tool status
- Method: `async mainLoop()`
  - Loop:
    - Prompt user for input
    - Check for commands (/help, /tools, /exit)
    - If not command: send to agent graph
    - Display thinking spinner
    - Invoke graph with state
    - Display response
    - Repeat
- Export and use in index.ts

---

### 4. Main Entry Point

**src/index.ts:**
- Import dotenv and call `dotenv.config()`
- Import all services (prisma, mcpService, graph, CLIInterface)
- Create `async main()` function:
  1. Initialize Prisma: Check DB connection
  2. Connect MCP servers:
     - Filesystem: `mcpService.connectServer('filesystem', 'npx', ['-y', '@modelcontextprotocol/server-filesystem', '/path'])`
     - GitHub: `mcpService.connectServer('github', 'npx', ['-y', '@modelcontextprotocol/server-github'])`
     - DuckDuckGo: `mcpService.connectServer('duckduckgo', 'npx', ['-y', '@modelcontextprotocol/server-duckduckgo'])`
  3. List all available tools from all MCP servers
  4. Create new conversation in DB
  5. Start CLI main loop
  6. Handle process exit: disconnect MCP servers, close Prisma
- Error handling: Wrap in try-catch, log errors
- Call `main().catch(console.error)`

---

## 🔌 MCP Servers (Install as NPM packages)

```bash
# Install MCP servers globally
npm install -g @modelcontextprotocol/server-filesystem
npm install -g @modelcontextprotocol/server-github
npm install -g @modelcontextprotocol/server-duckduckgo
```

**Connect in code:**
```typescript
// Filesystem
mcpService.connect('filesystem', 'npx', ['-y', '@modelcontextprotocol/server-filesystem', '/allowed/path'])

// GitHub
mcpService.connect('github', 'npx', ['-y', '@modelcontextprotocol/server-github'])

// DuckDuckGo
mcpService.connect('duckduckgo', 'npx', ['-y', '@modelcontextprotocol/server-duckduckgo'])
```

---

## ⚙️ Configuration

**.env:**
```env
DATABASE_URL="postgresql://user:pass@localhost:5432/db"
ANTHROPIC_API_KEY="sk-ant-xxx"
GITHUB_TOKEN="ghp_xxx"
```

**package.json scripts:**
```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "db:migrate": "prisma migrate dev",
    "db:studio": "prisma studio"
  }
}
```

---

## 🎯 Implementation Checklist

**Core (Must Have):**
- [ ] TypeScript project setup
- [ ] Prisma schema with 4 models
- [ ] Database migrations run
- [ ] LangGraph state machine (3 nodes)
- [ ] Claude API service
- [ ] MCP client service (connect 2+ servers)
- [ ] Conversation service (Prisma CRUD)
- [ ] CLI with colored output
- [ ] Error handling



---

## 🚀 Quick Start

```bash
# 1. Setup
mkdir project && cd project
npm init -y
npm install [packages above]

# 2. Prisma
npx prisma init --datasource-provider postgresql
# Edit schema.prisma
npx prisma migrate dev --name init

# 3. Create files
mkdir -p src/{agent,services,db,cli}
touch src/index.ts

# 4. Run
npx tsx watch src/index.ts
```

---

## 🔑 Key Concepts

**LangGraph:** State machine with nodes and edges for agent flow
**MCP:** Universal protocol to connect AI with tools (like USB-C for AI)
**Prisma:** Type-safe ORM for PostgreSQL
**Claude API:** LLM that can use tools

---

## 📖 Important Patterns

**State Management:**
- Use Annotation.Root() to define state
- Reducers combine state updates
- Each node returns partial state

**Tool Execution:**
- Model decides which tools to call
- Extract tool calls from Claude response
- Execute via MCP
- Return results to model

**Database:**
- Save every message
- Track all tool executions
- Store state checkpoints
- Use Prisma transactions

**MCP:**
- One client per server
- Servers run as child processes
- List tools on startup
- Route tool calls to correct server

---

## 💡 Critical Notes

1. MCP servers must be installed via npm globally
2. Use `npx -y @modelcontextprotocol/server-*` to run
3. Save state after every node execution
4. Handle tool errors gracefully
5. Track token usage in metadata
6. Use Prisma's type safety
7. Test MCP connections before main loop

---

## 🎓 Resources

- **Examples:** https://github.com/langchain-ai/langgraphjs/tree/main/examples
- **MCP Servers List:** https://github.com/modelcontextprotocol/servers
- **Claude Tool Use:** https://docs.anthropic.com/en/docs/build-with-claude/tool-use
- **Prisma Schema:** https://www.prisma.io/docs/orm/prisma-schema

---

**Ready to build! Your AI agent has everything it needs.** 🚀