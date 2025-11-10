import { TavilyClient } from 'tavily';
import chalk from 'chalk';

export class WebSearchService {
  private client: TavilyClient | null = null;
  private isConfigured: boolean = false;

  constructor() {
    const apiKey = process.env.TAVILY_API_KEY;
    if (apiKey && apiKey !== 'your_tavily_api_key_here') {
      this.client = new TavilyClient({ apiKey });
      this.isConfigured = true;
    }
  }

  /**
   * Check if web search is configured
   */
  isAvailable(): boolean {
    return this.isConfigured;
  }

  /**
   * Search the web using Tavily API
   */
  async search(
    query: string,
    options?: {
      searchDepth?: 'basic' | 'advanced';
      maxResults?: number;
      includeAnswer?: boolean;
    }
  ): Promise<any> {
    if (!this.isConfigured || !this.client) {
      throw new Error(
        'Web search not configured. Please set TAVILY_API_KEY in .env file.'
      );
    }

    try {
      const response = await this.client.search({
        query,
        search_depth: options?.searchDepth || 'basic',
        max_results: options?.maxResults || 5,
        include_answer: options?.includeAnswer !== false,
      });

      return {
        answer: response.answer,
        results:
          response.results?.map((r: any) => ({
            title: r.title,
            url: r.url,
            content: r.content,
            score: r.score,
          })) || [],
      };
    } catch (error) {
      const errorObj = error as Error;
      throw new Error(`Web search failed: ${errorObj.message}`);
    }
  }

  /**
   * Get search tool definition for Gemini (MCP-compatible format)
   */
  getToolDefinition() {
    return {
      name: 'web_search',
      description:
        'Search the web for current information, news, documentation, or any topic. Returns relevant results with summaries and links.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query to look up on the web',
          },
          maxResults: {
            type: 'number',
            description: 'Maximum number of results to return (default: 5)',
          },
        },
        required: ['query'],
      },
    };
  }

  /**
   * Execute web search tool
   */
  async executeTool(args: {
    query: string;
    maxResults?: number;
  }): Promise<string> {
    try {
      const results = await this.search(args.query, {
        maxResults: args.maxResults || 5,
      });

      let output = '';
      if (results.answer) {
        output += `Answer: ${results.answer}\n\n`;
      }

      output += 'Search Results:\n';
      results.results.forEach((result: any, index: number) => {
        output += `\n${index + 1}. ${result.title}\n`;
        output += `   URL: ${result.url}\n`;
        output += `   ${result.content}\n`;
      });

      return output;
    } catch (error) {
      throw error;
    }
  }
}

export const webSearchService = new WebSearchService();
