import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

interface MCPServer {
  name: string;
  command: string;
  args: string[];
  client?: Client;
  tools?: any[];
}

export class MCPService {
  private servers: Map<string, MCPServer> = new Map();
  private connectedServers: Set<string> = new Set();

  // Connect to an MCP server using stdio
  async connectServer(
    name: string,
    command: string,
    args: string[]
  ): Promise<void> {
    try {
      const client = new Client(
        {
          name: `gemini-assistant-${name}`,
          version: '1.0.0',
        },
        {
          capabilities: {
            tools: {},
          },
        }
      );

      // Create stdio transport to communicate with the MCP server
      const transport = new StdioClientTransport({
        command,
        args,
        stderr: 'pipe', // Capture stderr instead of inheriting
      });

      transport.onerror = (error) => {};

      transport.onclose = () => {
        this.connectedServers.delete(name);
      };

      await client.connect(transport);

      // Store server info
      this.servers.set(name, {
        name,
        command,
        args,
        client,
      });

      this.connectedServers.add(name);
    } catch (error) {
      throw error;
    }
  }

  async disconnectServer(name: string): Promise<void> {
    try {
      const server = this.servers.get(name);
      if (server?.client) {
        // Wrap close in try-catch to handle EPIPE errors
        try {
          await Promise.race([
            server.client.close(),
            new Promise((resolve) => setTimeout(resolve, 1000)), // 1s timeout
          ]);
        } catch (closeError: any) {}
        this.servers.delete(name);
        this.connectedServers.delete(name);
      }
    } catch (error) {}
  }

  async listTools(serverName: string): Promise<any[]> {
    try {
      const server = this.servers.get(serverName);
      if (!server?.client) {
        throw new Error(`Server ${serverName} not connected`);
      }

      const response = await server.client.listTools();
      const tools = response.tools || [];

      // Cache tools
      if (server) {
        server.tools = tools;
      }

      return tools;
    } catch (error) {
      return [];
    }
  }

  async getAllTools(): Promise<any[]> {
    const allTools: any[] = [];

    for (const serverName of this.connectedServers) {
      const tools = await this.listTools(serverName);
      allTools.push(...tools);
    }

    return allTools;
  }

  async callTool(
    serverName: string,
    toolName: string,
    args: any
  ): Promise<any> {
    try {
      const server = this.servers.get(serverName);
      if (!server?.client) {
        throw new Error(`Server ${serverName} not connected`);
      }

      const response = await server.client.callTool({
        name: toolName,
        arguments: args,
      });

      return response;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get server name for a tool (simple mapping for now)
   */
  getServerForTool(toolName: string): string | null {
    // This is a simple implementation - in a real system you might
    // want to maintain a tool-to-server mapping
    for (const [serverName, server] of this.servers) {
      if (server.tools?.some((tool: any) => tool.name === toolName)) {
        return serverName;
      }
    }
    return null;
  }

  // check if a server is connected
  isConnected(serverName: string): boolean {
    return this.connectedServers.has(serverName);
  }

  // get all connected server names
  getConnectedServers(): string[] {
    return Array.from(this.connectedServers);
  }
  // Disconnect all servers
  async disconnectAll(): Promise<void> {
    const promises = Array.from(this.connectedServers).map((serverName) =>
      this.disconnectServer(serverName).catch(() => {
      })
    );

    await Promise.all(promises);
  }
}

export const mcpService = new MCPService();
