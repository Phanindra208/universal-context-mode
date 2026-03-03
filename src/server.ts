import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';

import { executeTool } from './tools/execute.js';
import { executeFileTool } from './tools/execute-file.js';
import { indexContentTool } from './tools/index-content.js';
import { searchTool } from './tools/search.js';
import { fetchAndIndexTool } from './tools/fetch-and-index.js';
import { compressTool } from './tools/compress.js';
import { proxyTool } from './tools/proxy-tool.js';
import { statsTracker } from './utils/stats-tracker.js';
import { logger } from './utils/logger.js';

const TOOLS: Tool[] = [
  {
    name: 'execute',
    description: [
      'Execute code in a sandboxed subprocess. Only stdout enters the context window.',
      'Supports 10 runtimes: javascript, typescript, python, shell/bash, ruby, go, rust, php, perl, r.',
      'Use the intent parameter to filter large outputs to only relevant content.',
      'Prefer this over bash for commands that produce large output (git log, npm list, etc.).',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        language: {
          type: 'string',
          enum: [
            'javascript',
            'js',
            'typescript',
            'ts',
            'python',
            'py',
            'shell',
            'bash',
            'sh',
            'ruby',
            'rb',
            'go',
            'rust',
            'rs',
            'php',
            'perl',
            'pl',
            'r',
          ],
          description: 'Programming language or shell to use for execution.',
        },
        code: {
          type: 'string',
          description: 'The code or shell commands to execute.',
        },
        intent: {
          type: 'string',
          description:
            'Optional: describe what you are looking for in the output. Large outputs will be filtered to match this intent.',
        },
        timeout: {
          type: 'number',
          description: 'Execution timeout in milliseconds. Default: 30000.',
        },
        max_output_tokens: {
          type: 'number',
          description: 'Maximum output tokens to return. Default: 2000.',
        },
      },
      required: ['language', 'code'],
    },
  },
  {
    name: 'execute_file',
    description: [
      'Process a file in a sandboxed JavaScript subprocess without loading its full content into context.',
      'The file content is passed via the FILE_CONTENT environment variable.',
      'Your code should read process.env.FILE_CONTENT, process it, and print a summary to stdout.',
      'Only the summary enters the context window.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Absolute path to the file to process.',
        },
        code: {
          type: 'string',
          description: 'JavaScript code that reads process.env.FILE_CONTENT and prints a summary.',
        },
        intent: {
          type: 'string',
          description: 'Optional: what to look for in the file. Output will be filtered to match.',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds. Default: 30000.',
        },
      },
      required: ['file_path', 'code'],
    },
  },
  {
    name: 'index',
    description: [
      'Index markdown or text content into a SQLite FTS5 knowledge base.',
      'Content is split into heading-aware chunks with Porter stemming applied.',
      'Code blocks are preserved intact. Use search to query indexed content.',
      'Content is never stored in context — only chunk metadata.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The text or markdown content to index.',
        },
        source: {
          type: 'string',
          description: 'Source identifier (file path, URL, or description).',
        },
        kb_name: {
          type: 'string',
          description:
            'Knowledge base name. Default: "default". Use different names to separate content domains.',
        },
        chunk_size: {
          type: 'number',
          description: 'Maximum characters per chunk. Default: 1500.',
        },
      },
      required: ['content'],
    },
  },
  {
    name: 'search',
    description: [
      'BM25-ranked full-text search over indexed content.',
      'Returns relevant snippets with heading context, not full documents.',
      'Always search instead of re-reading indexed content.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language search query.',
        },
        kb_name: {
          type: 'string',
          description: 'Knowledge base name to search. Default: "default".',
        },
        top_k: {
          type: 'number',
          description: 'Number of results to return. Default: 5.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'fetch_and_index',
    description: [
      'Fetch a URL, convert HTML to markdown, and index it into the knowledge base.',
      'The raw HTML/content never enters the context window — only the index metadata.',
      'After indexing, use search to query the content.',
      'Use this for documentation pages, READMEs, API references, etc.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL to fetch and index.',
        },
        kb_name: {
          type: 'string',
          description: 'Knowledge base name. Default: "default".',
        },
        chunk_size: {
          type: 'number',
          description: 'Maximum characters per chunk. Default: 1500.',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'compress',
    description: [
      'Compress any large text to fit within context window limits.',
      'Automatically detects content type (JSON, logs, code, markdown, CSV, generic) ',
      'and applies the best compression strategy.',
      'Use intent to focus compression on what matters.',
      'No LLM calls — all compression is algorithmic (TF-IDF, pattern matching).',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The large text content to compress.',
        },
        intent: {
          type: 'string',
          description: 'Optional: what you are looking for. Focuses compression on relevant parts.',
        },
        strategy: {
          type: 'string',
          enum: ['auto', 'truncate', 'summarize', 'filter'],
          description: 'Compression strategy. Default: auto (detects best strategy).',
        },
        max_output_tokens: {
          type: 'number',
          description: 'Target maximum output tokens. Default: 2000.',
        },
      },
      required: ['content'],
    },
  },
  {
    name: 'proxy',
    description: [
      'Wrap another tool call and compress its output before it enters context.',
      'This is the key differentiator for IDEs without PreToolUse hooks.',
      'Supports: execute/bash (run code), read_file (read a file).',
      'For other tools: capture their output and pass to compress instead.',
      'Example: proxy({ tool: "bash", args: { command: "git log --oneline" }, intent: "recent changes" })',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        tool: {
          type: 'string',
          description: 'The tool to execute (e.g., "bash", "execute", "read_file").',
        },
        args: {
          type: 'object',
          description: 'Arguments to pass to the tool.',
        },
        intent: {
          type: 'string',
          description: 'What you are looking for in the output.',
        },
        strategy: {
          type: 'string',
          enum: ['auto', 'truncate', 'summarize', 'filter'],
          description: 'Compression strategy. Default: auto.',
        },
        max_output_tokens: {
          type: 'number',
          description: 'Maximum output tokens. Default: 2000.',
        },
      },
      required: ['tool', 'args'],
    },
  },
];

export function createServer(): { server: Server; transport: StdioServerTransport } {
  const server = new Server(
    {
      name: 'universal-context-mode',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List tools
  server.setRequestHandler(ListToolsRequestSchema, () => Promise.resolve({ tools: TOOLS }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async request => {
    const { name, arguments: args } = request.params;
    logger.debug('Tool called', { name, args });

    try {
      let result: string;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
      const typedArgs = (args ?? {}) as any;
      switch (name) {
        case 'execute':
          result = await executeTool(typedArgs as Parameters<typeof executeTool>[0]);
          break;
        case 'execute_file':
          result = await executeFileTool(typedArgs as Parameters<typeof executeFileTool>[0]);
          break;
        case 'index':
          result = await indexContentTool(typedArgs as Parameters<typeof indexContentTool>[0]);
          break;
        case 'search':
          result = await searchTool(typedArgs as Parameters<typeof searchTool>[0]);
          break;
        case 'fetch_and_index':
          result = await fetchAndIndexTool(typedArgs as Parameters<typeof fetchAndIndexTool>[0]);
          break;
        case 'compress':
          result = compressTool(typedArgs as Parameters<typeof compressTool>[0]);
          break;
        case 'proxy':
          result = await proxyTool(typedArgs as Parameters<typeof proxyTool>[0]);
          break;
        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      logger.debug('Tool completed', { name, outputLength: result.length });

      return {
        content: [{ type: 'text', text: result }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('Tool error', { name, error: message });
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();

  return { server, transport };
}

export function getSessionStats(): string {
  const stats = statsTracker.getSessionStats();
  const lines: string[] = [
    '=== Context-Mode Session Stats ===',
    `Total compressions: ${stats.totalEvents}`,
    `Input: ${(stats.totalInputBytes / 1024).toFixed(1)} KB (${stats.totalInputTokens.toLocaleString()} tokens)`,
    `Output: ${(stats.totalOutputBytes / 1024).toFixed(1)} KB (${stats.totalOutputTokens.toLocaleString()} tokens)`,
    `Saved: ${(stats.bytesSaved / 1024).toFixed(1)} KB (${stats.tokensSaved.toLocaleString()} tokens, ${stats.savingsRatio.toFixed(0)}%)`,
  ];
  return lines.join('\n');
}
