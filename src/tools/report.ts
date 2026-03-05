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
    return [
      '=== context-mode Report ===',
      '',
      'No compressions yet in this session.',
      '',
      'context-mode is connected and ready.',
      'It will compress large tool outputs automatically.',
      '',
      'Tip: Use context-mode.compress, context-mode.execute, or context-mode.proxy',
      'to start saving context window space.',
    ].join('\n');
  }

  const lines: string[] = [];

  lines.push('=== context-mode Session Report ===');
  lines.push('');

  // Session header — duration from server start to now
  const duration = formatDuration(stats.sessionStart, new Date());
  lines.push(
    `Session: ${duration} | ${stats.totalEvents} compression${stats.totalEvents !== 1 ? 's' : ''}`
  );
  lines.push('');

  // Savings summary
  lines.push('SAVINGS SUMMARY');
  lines.push(
    `  Input:   ${formatKB(stats.totalInputBytes).padStart(10)}  (~${formatTokens(stats.totalInputTokens)})`
  );
  lines.push(
    `  Output:  ${formatKB(stats.totalOutputBytes).padStart(10)}  (~${formatTokens(stats.totalOutputTokens)})`
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

  // Status
  const status =
    stats.savingsRatio > 0
      ? `✓ Working — saved ${formatKB(stats.bytesSaved)} from context window`
      : '⚠ No savings yet';
  lines.push(`STATUS: ${status}`);

  return lines.join('\n');
}

export function reportTool(): string {
  const stats = statsTracker.getSessionStats();
  return buildReport(stats);
}
