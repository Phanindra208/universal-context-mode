import { estimateTokens } from './token-estimator.js';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

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
  sessionStart: Date;
  // Raw request tracking (every tool call, not just compressions)
  totalRequests: number;
  rawInputTokens: number;
  rawInputBytes: number;
  rawInputByTool: Record<string, number>;
}

export interface HistoricalStats {
  todayBytesSaved: number;
  todayTokensSaved: number;
  todaySessions: number;
  allTimeBytesSaved: number;
  allTimeTokensSaved: number;
  allTimeSessions: number;
  lastUpdated: string; // ISO date string
}

interface PersistedData {
  today: string; // YYYY-MM-DD
  todayBytesSaved: number;
  todayTokensSaved: number;
  todaySessions: number;
  allTimeBytesSaved: number;
  allTimeTokensSaved: number;
  allTimeSessions: number;
}

const STATS_FILE = join(homedir(), '.ucm-stats.json');

function loadPersistedData(): PersistedData {
  try {
    const raw = readFileSync(STATS_FILE, 'utf8');
    return JSON.parse(raw) as PersistedData;
  } catch {
    return {
      today: '',
      todayBytesSaved: 0,
      todayTokensSaved: 0,
      todaySessions: 1,
      allTimeBytesSaved: 0,
      allTimeTokensSaved: 0,
      allTimeSessions: 1,
    };
  }
}

function savePersistedData(data: PersistedData): void {
  try {
    mkdirSync(homedir(), { recursive: true });
    writeFileSync(STATS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch {
    // Non-fatal — stats persist best-effort
  }
}

class StatsTracker {
  private events: CompressionEvent[] = [];
  private readonly sessionStart: Date = new Date();
  private persisted: PersistedData;
  private totalRequests: number = 0;
  private rawInputTokens: number = 0;
  private rawInputBytes: number = 0;
  private rawInputByTool: Record<string, number> = {};

  constructor() {
    this.persisted = loadPersistedData();
    // Reset today's stats if it's a new day
    const today = new Date().toISOString().slice(0, 10);
    if (this.persisted.today !== today) {
      this.persisted.today = today;
      this.persisted.todayBytesSaved = 0;
      this.persisted.todayTokensSaved = 0;
      this.persisted.todaySessions = 0;
    }
    // Count this as a new session
    this.persisted.todaySessions += 1;
    this.persisted.allTimeSessions += 1;
    savePersistedData(this.persisted);
  }

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

    // Persist to disk
    const saved = inputBytes - outputBytes;
    const tokensSaved = inputTokens - outputTokens;
    this.persisted.todayBytesSaved += saved;
    this.persisted.todayTokensSaved += tokensSaved;
    this.persisted.allTimeBytesSaved += saved;
    this.persisted.allTimeTokensSaved += tokensSaved;
    savePersistedData(this.persisted);

    return event;
  }

  recordRawInput(tool: string, inputText: string): void {
    this.totalRequests += 1;
    const inputBytes = Buffer.byteLength(inputText, 'utf8');
    const inputTokens = estimateTokens(inputText).tokens;
    this.rawInputTokens += inputTokens;
    this.rawInputBytes += inputBytes;
    this.rawInputByTool[tool] = (this.rawInputByTool[tool] ?? 0) + inputTokens;
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
      sessionStart: this.sessionStart,
      totalRequests: this.totalRequests,
      rawInputTokens: this.rawInputTokens,
      rawInputBytes: this.rawInputBytes,
      rawInputByTool: { ...this.rawInputByTool },
    };
  }

  getHistoricalStats(): HistoricalStats {
    return {
      todayBytesSaved: this.persisted.todayBytesSaved,
      todayTokensSaved: this.persisted.todayTokensSaved,
      todaySessions: this.persisted.todaySessions,
      allTimeBytesSaved: this.persisted.allTimeBytesSaved,
      allTimeTokensSaved: this.persisted.allTimeTokensSaved,
      allTimeSessions: this.persisted.allTimeSessions,
      lastUpdated: this.persisted.today,
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
    this.totalRequests = 0;
    this.rawInputTokens = 0;
    this.rawInputBytes = 0;
    this.rawInputByTool = {};
  }
}

export const statsTracker = new StatsTracker();
