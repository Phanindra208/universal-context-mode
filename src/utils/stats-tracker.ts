import { estimateTokens } from './token-estimator.js';

export interface CompressionEvent {
  tool: string;
  inputBytes: number;
  outputBytes: number;
  inputTokens: number;
  outputTokens: number;
  strategy: string;
  timestamp: Date;
}

export interface SessionStats {
  totalInputBytes: number;
  totalOutputBytes: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalEvents: number;
  bytesSaved: number;
  tokensSaved: number;
  savingsRatio: number;
  events: CompressionEvent[];
}

class StatsTracker {
  private events: CompressionEvent[] = [];

  record(tool: string, inputText: string, outputText: string, strategy: string): CompressionEvent {
    const inputBytes = Buffer.byteLength(inputText, 'utf8');
    const outputBytes = Buffer.byteLength(outputText, 'utf8');
    const inputTokens = estimateTokens(inputText).tokens;
    const outputTokens = estimateTokens(outputText).tokens;

    const event: CompressionEvent = {
      tool,
      inputBytes,
      outputBytes,
      inputTokens,
      outputTokens,
      strategy,
      timestamp: new Date(),
    };

    this.events.push(event);
    return event;
  }

  getSessionStats(): SessionStats {
    const totalInputBytes = this.events.reduce((s, e) => s + e.inputBytes, 0);
    const totalOutputBytes = this.events.reduce((s, e) => s + e.outputBytes, 0);
    const totalInputTokens = this.events.reduce((s, e) => s + e.inputTokens, 0);
    const totalOutputTokens = this.events.reduce((s, e) => s + e.outputTokens, 0);
    const bytesSaved = totalInputBytes - totalOutputBytes;
    const tokensSaved = totalInputTokens - totalOutputTokens;
    const savingsRatio = totalInputBytes > 0 ? (bytesSaved / totalInputBytes) * 100 : 0;

    return {
      totalInputBytes,
      totalOutputBytes,
      totalInputTokens,
      totalOutputTokens,
      totalEvents: this.events.length,
      bytesSaved,
      tokensSaved,
      savingsRatio,
      events: [...this.events],
    };
  }

  formatStatsFooter(inputText: string, outputText: string, strategy: string): string {
    const inputBytes = Buffer.byteLength(inputText, 'utf8');
    const outputBytes = Buffer.byteLength(outputText, 'utf8');
    const saved = inputBytes - outputBytes;
    const ratio = inputBytes > 0 ? ((saved / inputBytes) * 100).toFixed(0) : '0';
    const inputKB = (inputBytes / 1024).toFixed(1);
    const outputKB = (outputBytes / 1024).toFixed(1);

    return `\n---\n[context-mode] Compressed: ${inputKB}KB → ${outputKB}KB (${ratio}% saved, strategy: ${strategy})`;
  }

  reset(): void {
    this.events = [];
  }
}

export const statsTracker = new StatsTracker();
