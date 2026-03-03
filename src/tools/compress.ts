import { compress, type CompressionStrategy } from '../compression/strategies.js';
import { statsTracker } from '../utils/stats-tracker.js';
import { DEFAULT_CONFIG } from '../config/defaults.js';

export interface CompressToolInput {
  content: string;
  intent?: string;
  strategy?: CompressionStrategy;
  max_output_tokens?: number;
}

export function compressTool(input: CompressToolInput): string {
  const maxChars = input.max_output_tokens
    ? input.max_output_tokens * 4
    : DEFAULT_CONFIG.compression.maxOutputBytes;

  const result = compress(input.content, {
    intent: input.intent,
    strategy: input.strategy ?? 'auto',
    maxOutputChars: maxChars,
  });

  if (result.strategy === 'as-is') {
    return result.output;
  }

  statsTracker.record('compress', input.content, result.output, result.strategy);

  const footer = [
    '',
    '---',
    `[context-mode] ${result.contentType} content compressed: ` +
      `${Math.round(result.inputChars / 1024)}KB → ${Math.round(result.outputChars / 1024)}KB ` +
      `(${result.savedPercent}% saved, strategy: ${result.strategy})`,
  ].join('\n');

  return result.output + footer;
}
