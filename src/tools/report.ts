import { statsTracker, type SessionStats } from '../utils/stats-tracker.js';

function formatKB(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K tokens`;
  return `${tokens} tokens`;
}

function formatDuration(start: Date, end: Date): string {
  const ms = end.getTime() - start.getTime();
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function buildReport(stats: SessionStats): string {
  if (stats.totalEvents === 0) {
    const hist = statsTracker.getHistoricalStats();
    const requestLine =
      stats.totalRequests > 0
        ? `${stats.totalRequests} request${stats.totalRequests !== 1 ? 's' : ''} tracked (${formatTokens(stats.rawInputTokens)} input tokens seen). Output compression triggers above 5KB.`
        : 'No requests yet.';
    const histLines = [
      '=== context-mode Report ===',
      '',
      `No compressions yet in this session. ${requestLine}`,
      '',
      'context-mode is connected and ready.',
      'It automatically compresses large tool outputs (>5KB) for all tools.',
      '',
      'Tip: Use context-mode.compress, context-mode.execute, or context-mode.proxy',
      'to start saving context window space.',
    ];
    if (hist.allTimeBytesSaved > 0) {
      histLines.push('');
      histLines.push('HISTORICAL');
      histLines.push(
        `  Today      ${formatKB(hist.todayBytesSaved).padStart(10)}  (~${formatTokens(hist.todayTokensSaved)})  across ${hist.todaySessions} session${hist.todaySessions !== 1 ? 's' : ''}`
      );
      histLines.push(
        `  All time   ${formatKB(hist.allTimeBytesSaved).padStart(10)}  (~${formatTokens(hist.allTimeTokensSaved)})  across ${hist.allTimeSessions} session${hist.allTimeSessions !== 1 ? 's' : ''}`
      );
    }
    return histLines.join('\n');
  }

  const lines: string[] = [];

  lines.push('=== context-mode Session Report ===');
  lines.push('');

  // Session header — duration from server start to now
  const duration = formatDuration(stats.sessionStart, new Date());
  lines.push(
    `Session: ${duration} | ${stats.totalRequests} request${stats.totalRequests !== 1 ? 's' : ''} | ${stats.totalEvents} compression${stats.totalEvents !== 1 ? 's' : ''}`
  );
  lines.push('');

  // Per-request token tracking (every tool call)
  lines.push('PER-REQUEST TOKEN TRACKING');
  lines.push(`  Total requests:  ${stats.totalRequests}`);
  lines.push(
    `  Input tokens:    ${formatTokens(stats.rawInputTokens).padStart(14)}  (${formatKB(stats.rawInputBytes)} sent to tools)`
  );
  if (stats.totalEvents > 0) {
    const outputBefore = formatTokens(stats.totalInputTokens);
    const outputAfter = formatTokens(stats.totalOutputTokens);
    lines.push(`  Output tokens:   ${outputBefore.padStart(14)} → ${outputAfter} (compressed)`);
    lines.push(`  Net tokens saved: ${formatTokens(stats.tokensSaved)}`);
  } else {
    lines.push(`  Output tokens:   (no compressions triggered yet)`);
  }
  lines.push('');

  // Savings summary (compressions only)
  lines.push('COMPRESSION SAVINGS');
  lines.push(
    `  Before:  ${formatKB(stats.totalInputBytes).padStart(10)}  (~${formatTokens(stats.totalInputTokens)})`
  );
  lines.push(
    `  After:   ${formatKB(stats.totalOutputBytes).padStart(10)}  (~${formatTokens(stats.totalOutputTokens)})`
  );
  lines.push(
    `  Saved:   ${formatKB(stats.bytesSaved).padStart(10)}  (~${formatTokens(stats.tokensSaved)})`
  );
  lines.push(`  Ratio:   ${stats.savingsRatio.toFixed(1)}% reduction`);
  lines.push('');

  // By tool breakdown
  const byTool = new Map<string, { count: number; bytesSaved: number; tokensSaved: number }>();
  for (const event of stats.events) {
    const existing = byTool.get(event.tool) ?? { count: 0, bytesSaved: 0, tokensSaved: 0 };
    existing.count += 1;
    existing.bytesSaved += event.inputBytes - event.outputBytes;
    existing.tokensSaved += event.inputTokens - event.outputTokens;
    byTool.set(event.tool, existing);
  }

  const sorted = [...byTool.entries()].sort((a, b) => b[1].bytesSaved - a[1].bytesSaved);

  lines.push('BY TOOL');
  for (const [tool, data] of sorted) {
    const countStr = `${data.count}x`.padEnd(4);
    const savedStr = formatKB(data.bytesSaved).padStart(10);
    const tokenStr = formatTokens(data.tokensSaved);
    lines.push(`  ${tool.padEnd(16)} ${countStr}  ${savedStr} saved  (~${tokenStr})`);
  }
  lines.push('');

  // Historical stats
  const hist = statsTracker.getHistoricalStats();
  lines.push('');
  lines.push('HISTORICAL');
  lines.push(
    `  Today      ${formatKB(hist.todayBytesSaved).padStart(10)}  (~${formatTokens(hist.todayTokensSaved)})  across ${hist.todaySessions} session${hist.todaySessions !== 1 ? 's' : ''}`
  );
  lines.push(
    `  All time   ${formatKB(hist.allTimeBytesSaved).padStart(10)}  (~${formatTokens(hist.allTimeTokensSaved)})  across ${hist.allTimeSessions} session${hist.allTimeSessions !== 1 ? 's' : ''}`
  );
  lines.push('');

  // Status
  const status =
    stats.savingsRatio > 0
      ? `✓ Working — saved ${formatKB(stats.bytesSaved)} from context window this session`
      : '⚠ No compressions yet this session';
  lines.push(`STATUS: ${status}`);

  return lines.join('\n');
}

export function reportTool(): string {
  const stats = statsTracker.getSessionStats();
  return buildReport(stats);
}
