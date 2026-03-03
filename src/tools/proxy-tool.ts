import { compress, type CompressionStrategy } from '../compression/strategies.js';
import { statsTracker } from '../utils/stats-tracker.js';
import { DEFAULT_CONFIG } from '../config/defaults.js';
import { executeCode } from '../sandbox/executor.js';
import { type Language } from '../sandbox/runtimes.js';

export interface ProxyToolInput {
  tool: string;
  args: Record<string, unknown>;
  intent?: string;
  strategy?: CompressionStrategy;
  max_output_tokens?: number;
}

/**
 * The proxy tool wraps any MCP tool call, compresses its output,
 * and returns the compressed version.
 *
 * Since we can't directly call other MCP tools (the MCP protocol
 * is 1:1 client↔server), the proxy handles the most common
 * patterns by delegating to the appropriate internal implementations.
 *
 * For IDE-native tools (bash, read_file, etc.), users should
 * pipe output through compress() or execute() instead.
 */
export async function proxyTool(input: ProxyToolInput): Promise<string> {
  const maxChars = input.max_output_tokens
    ? input.max_output_tokens * 4
    : DEFAULT_CONFIG.compression.maxOutputBytes;

  let rawOutput: string;

  // Handle built-in tool delegations
  switch (input.tool) {
    case 'execute':
    case 'bash': {
      const lang = (input.args['language'] as Language | undefined) ?? 'shell';
      const code =
        (input.args['code'] as string | undefined) ??
        (input.args['command'] as string | undefined) ??
        '';

      const result = await executeCode({ language: lang, code });
      rawOutput = result.stdout;
      if (result.exitCode !== 0 && result.stderr) {
        rawOutput += `\nSTDERR:\n${result.stderr}`;
      }
      break;
    }

    case 'read_file': {
      const filePath = input.args['path'] as string | undefined;
      if (!filePath) {
        return 'Error: proxy(read_file) requires args.path';
      }
      const { readFile } = await import('fs/promises');
      try {
        rawOutput = await readFile(filePath, 'utf8');
      } catch (err) {
        return `Error reading file "${filePath}": ${String(err)}`;
      }
      break;
    }

    default: {
      // For unknown tools, instruct the user how to use compress directly
      return [
        `The proxy tool cannot directly invoke "${input.tool}" ` +
          `(MCP servers cannot call other MCP tools).`,
        '',
        'Instead, capture the output yourself and pipe it through the compress tool:',
        '',
        '```',
        `compress({`,
        `  content: <output from ${input.tool}>,`,
        input.intent ? `  intent: "${input.intent}",` : '',
        `})`,
        '```',
        '',
        'Or use execute() with shell to run CLI commands and get compressed output.',
      ]
        .filter(Boolean)
        .join('\n');
    }
  }

  const compressed = compress(rawOutput, {
    intent: input.intent,
    strategy: input.strategy ?? 'auto',
    maxOutputChars: maxChars,
  });

  if (compressed.strategy !== 'as-is') {
    statsTracker.record(`proxy:${input.tool}`, rawOutput, compressed.output, compressed.strategy);

    const footer = statsTracker.formatStatsFooter(
      rawOutput,
      compressed.output,
      compressed.strategy
    );
    return compressed.output + footer;
  }

  return compressed.output;
}
