import { executeCode, type ExecuteResult } from '../sandbox/executor.js';
import { compress } from '../compression/strategies.js';
import { statsTracker } from '../utils/stats-tracker.js';
import { type Language } from '../sandbox/runtimes.js';
import { DEFAULT_CONFIG } from '../config/defaults.js';

export interface ExecuteToolInput {
  language: Language;
  code: string;
  intent?: string;
  timeout?: number;
  max_output_tokens?: number;
}

export async function executeTool(input: ExecuteToolInput): Promise<string> {
  const result: ExecuteResult = await executeCode({
    language: input.language,
    code: input.code,
    timeoutMs: input.timeout ?? DEFAULT_CONFIG.sandbox.timeoutMs,
    memoryMB: DEFAULT_CONFIG.sandbox.memoryMB,
  });

  let rawOutput = result.stdout;
  if (result.stderr && result.exitCode !== 0) {
    rawOutput += result.stderr ? `\nSTDERR:\n${result.stderr}` : '';
  }

  if (result.timedOut) {
    rawOutput =
      `[TIMEOUT after ${input.timeout ?? DEFAULT_CONFIG.sandbox.timeoutMs}ms]\n` + rawOutput;
  }

  if (result.exitCode !== 0 && !result.timedOut) {
    rawOutput += `\n[Exit code: ${result.exitCode}]`;
    if (result.stderr) rawOutput += `\nSTDERR:\n${result.stderr}`;
  }

  const maxChars = input.max_output_tokens
    ? input.max_output_tokens * 4
    : DEFAULT_CONFIG.compression.maxOutputBytes;

  const compressed = compress(rawOutput, {
    intent: input.intent,
    maxOutputChars: maxChars,
  });

  if (compressed.strategy !== 'as-is') {
    statsTracker.record('execute', rawOutput, compressed.output, compressed.strategy);
    return (
      compressed.output +
      statsTracker.formatStatsFooter(rawOutput, compressed.output, compressed.strategy)
    );
  }

  return compressed.output;
}
