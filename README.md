# Claude Code Assistant

An AI-powered coding assistant built with Node.js/TypeScript, integrating Gemini API via LangGraph for agentic workflow and MCP (Model Context Protocol) for external tool access.

## 🎯 Features

- **AI-Powered Assistance**: Leverages Gemini API (Gemini 2.5 Flash) for intelligent code understanding and generation
- **Tool Integration**: Connects to external tools via Model Context Protocol (MCP)
  - Filesystem operations (read, write, search files)
  - GitHub integration (with token support)
  - Web search capabilities (Brave Search API)
- **Conversation Memory**: Maintains context across interactions with PostgreSQL database
- **Clean CLI Interface**: Professional copper-themed command-line interface
- **State Management**: LangGraph-powered agent workflow for complex task orchestration

## 📋 Prerequisites

- Node.js 18+
- PostgreSQL database
- Gemini API key
- (Optional) GitHub token for GitHub integration
- (Optional) Brave API key for web search

## 🚀 Installation

1. **Clone the repository**

```bash
git clone <repository-url>
cd claude-code
```

2. **Install dependencies**

```bash
npm install
```

3. **Set up environment variables**

Create a `.env` file in the root directory:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/claude_code"

# Gemini API
GEMINI_API_KEY="your_gemini_api_key_here"

# Optional: GitHub Integration
GITHUB_TOKEN="your_github_token_here"

# Optional: Brave Search
BRAVE_API_KEY="your_brave_api_key_here"
```

4. **Set up the database**

```bash
npm run db:migrate
```

5. **Build the project**

```bash
npm run build
```

## 🎮 Usage

### Start the assistant

```bash
npm start
```

### Available Commands

Once the assistant is running:

- `/help` - Show available commands
- `/tools` - List all connected tools
- `/exit` - Exit the application

### Example Interactions

```
You: read the files in this project and summarize it

You: create a new file called test.js with a hello world function

You: search for TODO comments in all files
```

## 🏗️ Architecture

### Project Structure

```
claude-code/
├── src/
│   ├── agent/           # LangGraph state machine
│   │   ├── graph.ts     # State graph definition
│   │   ├── nodes.ts     # Node implementations
│   │   └── state.ts     # State schema
│   ├── services/        # Business logic services
│   │   ├── gemini.service.ts      # Gemini API integration
│   │   ├── mcp.service.ts         # MCP server management
│   │   └── conversation.service.ts # Database operations
│   ├── cli/             # Command-line interface
│   │   └── interface.ts
│   ├── db/              # Database setup
│   │   └── prisma.ts
│   └── index.ts         # Application entry point
├── prisma/
│   └── schema.prisma    # Database schema
└── package.json
```

### System Flow

1. **User Input** → CLI Interface
2. **LangGraph State Machine**:
   - **User Input Node**: Saves message to database
   - **Model Node**: Claude decides to respond or use tools
   - **Tool Node**: Executes MCP tools, loops back if needed
3. **Database** → Stores conversations, messages, and tool executions
4. **Response** → Displayed to user

### Database Schema

- **Conversation**: Stores conversation metadata
- **Message**: Individual messages (user, assistant, tool)
- **ToolExecution**: Logs of tool calls with input/output
- **StateCheckpoint**: State snapshots for debugging

## 🛠️ Development

### Scripts

```bash
npm run dev        # Run in development mode with auto-reload
npm run build      # Compile TypeScript to JavaScript
npm start          # Run the compiled application
npm run db:migrate # Run database migrations
npm run db:studio  # Open Prisma Studio (database GUI)
```

### MCP Servers

The assistant connects to the following MCP servers:

- **@modelcontextprotocol/server-filesystem**: File operations
- **@missionsquad/mcp-github**: GitHub integration
- **@brave/brave-search-mcp-server**: Web search

Servers are automatically installed via `npx` when the application starts.

## 🎨 Features

### Copper Theme

The CLI uses a consistent copper color scheme (#CD6F47) for a professional appearance:

- ASCII art banner
- Success indicators
- Status messages
- Tool execution feedback

### Conversation Context

- Automatically loads last 10 messages for context
- Prevents token overflow with message limiting
- Persistent storage in PostgreSQL

### Error Handling

- Silent error handling for clean user experience
- Graceful shutdown on SIGINT/SIGTERM
- EPIPE error suppression for MCP transport

## 📝 Configuration

### Adjusting Context Window

Edit `src/index.ts` to change the number of messages loaded:

```typescript
const conversationHistory = await conversationService.getConversationMessages(
  conversation.id,
  10 // Change this number
);
```

### Adding New MCP Servers

Edit `src/index.ts` to add new MCP server connections:

```typescript
await mcpService.connectServer('server-name', 'npx', [
  '-y',
  'package-name',
  ...args,
]);
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

[Your License Here]

## 🙏 Acknowledgments

- **Gemini API** by Google
- **LangGraph.js** for agent orchestration
- **Model Context Protocol** for tool integration
- **Prisma** for database management
