/**
 * Content-type-aware compression strategies.
 * All algorithmic — no LLM calls, no API dependencies.
 */

import { filterByIntent } from './intent-filter.js';

export type ContentType =
  | 'json'
  | 'log'
  | 'code'
  | 'markdown'
  | 'csv'
  | 'yaml'
  | 'xml'
  | 'diff'
  | 'stacktrace'
  | 'env'
  | 'generic';
export type CompressionStrategy = 'auto' | 'truncate' | 'summarize' | 'filter' | 'as-is';

export interface CompressOptions {
  intent?: string;
  maxOutputChars?: number;
  headLines?: number;
  tailLines?: number;
  strategy?: CompressionStrategy;
}

export interface CompressResult {
  output: string;
  strategy: CompressionStrategy;
  contentType: ContentType;
  inputChars: number;
  outputChars: number;
  savedPercent: number;
}

const DEFAULT_MAX_CHARS = 8000;
const THRESHOLD_CHARS = 5120; // ~5KB

// ─── Content Type Detection ──────────────────────────────────────────────────

export function detectContentType(text: string): ContentType {
  const trimmed = text.trimStart();

  // JSON: starts with { or [ and is parseable
  if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && isValidJson(trimmed)) {
    return 'json';
  }

  // Git diff: starts with diff --git or --- a/
  if (/^(diff --git|--- a\/|@@\s+-\d+)/.test(trimmed)) return 'diff';

  // Stack trace: common crash/exception patterns
  if (looksLikeStackTrace(trimmed)) return 'stacktrace';

  // XML: starts with < and has tag structure
  if (trimmed.startsWith('<') && /<\w[\w:.-]*(\s[^>]*)?>/.test(trimmed)) return 'xml';

  // YAML: key: value structure (not JSON)
  if (looksLikeYaml(trimmed)) return 'yaml';

  // .env / INI: KEY=VALUE or [section] patterns
  if (looksLikeEnv(trimmed)) return 'env';

  // CSV: consistent delimiter pattern in first few lines
  const firstLines = trimmed.split('\n').slice(0, 5);
  if (looksLikeCsv(firstLines)) return 'csv';

  // Log: timestamp patterns at line starts
  if (looksLikeLog(firstLines)) return 'log';

  // Code: significant code indicators
  if (looksLikeCode(trimmed)) return 'code';

  // Markdown: heading or fence patterns
  if (looksLikeMarkdown(trimmed)) return 'markdown';

  return 'generic';
}

function isValidJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

function looksLikeCsv(lines: string[]): boolean {
  if (lines.length < 2) return false;
  const delimiters = [',', '\t', ';', '|'];
  for (const delim of delimiters) {
    const counts = lines.map(l => l.split(delim).length);
    const consistent = counts.every(c => c === counts[0] && c > 1);
    if (consistent) return true;
  }
  return false;
}

function looksLikeLog(lines: string[]): boolean {
  const logPatterns = [
    /^\d{4}-\d{2}-\d{2}/, // ISO date
    /^\[\d{2}:\d{2}:\d{2}\]/, // [HH:MM:SS]
    /^[A-Z]{4,5}:/, // INFO: WARN: ERROR:
    /^\d{13}\s/, // Unix ms timestamp
  ];
  const matchCount = lines.filter(l => logPatterns.some(p => p.test(l))).length;
  return matchCount >= Math.min(2, lines.length);
}

function looksLikeCode(text: string): boolean {
  const codeIndicators = [
    /^(function|const|let|var|class|import|export|def|fn |pub |async)\s/m,
    /[{}]\s*$/m,
    /=>\s*\{/,
    /^\s{2,}(if|for|while|return)\s/m,
  ];
  return codeIndicators.filter(p => p.test(text)).length >= 2;
}

function looksLikeMarkdown(text: string): boolean {
  return /^#{1,6}\s/m.test(text) || /^```/m.test(text) || /^\s*[-*]\s/m.test(text);
}

function looksLikeYaml(text: string): boolean {
  const lines = text.split('\n').slice(0, 10);
  const kvLines = lines.filter(l => /^\s*[\w.-]+\s*:(\s|$)/.test(l)).length;
  return kvLines >= Math.min(3, lines.length);
}

function looksLikeEnv(text: string): boolean {
  const lines = text
    .split('\n')
    .slice(0, 10)
    .filter(l => l.trim() && !l.startsWith('#'));
  const kvLines = lines.filter(l => /^[A-Z_][A-Z0-9_]*\s*=/.test(l) || /^\[.+\]$/.test(l)).length;
  return kvLines >= Math.min(2, lines.length);
}

function looksLikeStackTrace(text: string): boolean {
  return (
    (/at\s+[\w.<>$]+\s*\(/.test(text) && /Error:|Exception:/.test(text)) || // JS/Java
    (/Traceback \(most recent call last\)/i.test(text) && /File ".+", line \d+/.test(text)) || // Python
    (/thread '.+' panicked at/.test(text) && /stack backtrace/.test(text)) || // Rust
    (/#\d+\s+0x[0-9a-f]+ in /.test(text) && /\(gdb\)|Backtrace/.test(text)) // C/C++ GDB
  );
}

// ─── Compression Strategies ──────────────────────────────────────────────────

function compressJson(text: string, maxChars: number, intent?: string): string {
  if (intent) return filterByIntent(text, intent, maxChars);

  try {
    const parsed = JSON.parse(text) as unknown;
    return summarizeJson(parsed, maxChars);
  } catch {
    return genericTruncate(text, maxChars, 50, 20);
  }
}

function summarizeJson(value: unknown, maxChars: number, depth = 0): string {
  const lines: string[] = [];

  if (Array.isArray(value)) {
    lines.push(`Array[${value.length}]`);
    if (value.length > 0) {
      lines.push(`  Type: ${getJsonType(value[0])}`);
      // Show structure of first element
      if (typeof value[0] === 'object' && value[0] !== null) {
        lines.push(`  Keys: ${Object.keys(value[0] as object).join(', ')}`);
      }
      // Show first 3 items summarized
      const sample = value.slice(0, 3);
      lines.push(`  Sample (${sample.length} of ${value.length}):`);
      for (const item of sample) {
        lines.push(`    ${JSON.stringify(item).slice(0, 200)}`);
      }
    }
  } else if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    lines.push(`Object {${keys.length} keys}`);
    lines.push(`Keys: ${keys.slice(0, 30).join(', ')}${keys.length > 30 ? '...' : ''}`);
    if (depth < 2) {
      for (const key of keys.slice(0, 15)) {
        const val = obj[key];
        if (Array.isArray(val)) {
          lines.push(`  ${key}: Array[${val.length}]`);
        } else if (typeof val === 'object' && val !== null) {
          lines.push(`  ${key}: Object{${Object.keys(val).join(', ').slice(0, 60)}}`);
        } else {
          lines.push(`  ${key}: ${JSON.stringify(val)?.slice(0, 100) ?? 'null'}`);
        }
      }
      if (keys.length > 15) lines.push(`  ... and ${keys.length - 15} more keys`);
    }
  } else {
    lines.push(JSON.stringify(value) ?? 'null');
  }

  const result = lines.join('\n');
  return result.length > maxChars ? result.slice(0, maxChars) : result;
}

function getJsonType(value: unknown): string {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

function compressLog(text: string, maxChars: number, intent?: string): string {
  if (intent) return filterByIntent(text, intent, maxChars);

  const lines = text.split('\n');
  const totalLines = lines.length;

  // Group similar log lines
  const patterns: Map<string, { count: number; example: string }> = new Map();
  const errors: string[] = [];
  const warnings: string[] = [];
  const unique: string[] = [];

  for (const line of lines) {
    // Normalize timestamps and IDs for pattern matching
    const normalized = line
      .replace(/\d{4}-\d{2}-\d{2}T?\d{2}:\d{2}:\d{2}(\.\d+)?Z?/g, '<TIMESTAMP>')
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<UUID>')
      .replace(/\b\d+\b/g, '<N>');

    const existing = patterns.get(normalized);
    if (existing) {
      existing.count++;
    } else {
      patterns.set(normalized, { count: 1, example: line });
    }

    if (/\b(error|exception|fatal|panic|critical)\b/i.test(line)) {
      errors.push(line.slice(0, 300));
    } else if (/\b(warn|warning)\b/i.test(line)) {
      warnings.push(line.slice(0, 200));
    }
  }

  const result: string[] = [`=== Log Summary: ${totalLines} lines ===`, ''];

  if (errors.length > 0) {
    result.push(`ERRORS (${errors.length}):`);
    result.push(...errors.slice(0, 10).map(e => `  ${e}`));
    if (errors.length > 10) result.push(`  ... and ${errors.length - 10} more errors`);
    result.push('');
  }

  if (warnings.length > 0) {
    result.push(`WARNINGS (${warnings.length}):`);
    result.push(...warnings.slice(0, 5).map(w => `  ${w}`));
    if (warnings.length > 5) result.push(`  ... and ${warnings.length - 5} more warnings`);
    result.push('');
  }

  // Show top repeated patterns
  const sorted = Array.from(patterns.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 20);

  result.push('TOP LOG PATTERNS:');
  for (const [, { count, example }] of sorted) {
    if (count > 1) {
      result.push(`  [x${count}] ${example.slice(0, 150)}`);
    }
  }

  // Show unique lines (low frequency)
  for (const [, { count, example }] of sorted) {
    if (count === 1) {
      unique.push(example);
    }
  }
  if (unique.length > 0) {
    result.push('');
    result.push(`UNIQUE LINES (${unique.length}):`);
    result.push(...unique.slice(0, 20).map(l => `  ${l.slice(0, 150)}`));
  }

  const output = result.join('\n');
  return output.length > maxChars ? output.slice(0, maxChars) : output;
}

function compressCode(text: string, maxChars: number, intent?: string): string {
  if (intent) return filterByIntent(text, intent, maxChars);

  const lines = text.split('\n');
  const result: string[] = [];
  let inBlock = false;
  let braceDepth = 0;
  let blockLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Always include comments and top-level signatures
    if (
      trimmed.startsWith('//') ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('/*') ||
      trimmed.startsWith('*')
    ) {
      result.push(line);
      continue;
    }

    // Detect function/class signatures
    const isSig =
      /^(export\s+)?(async\s+)?function\s+\w+|^(export\s+)?(abstract\s+)?class\s+\w+|^\s*(public|private|protected|static|async)?\s*\w+\s*\(/.test(
        trimmed
      );
    const isArrow = /^(export\s+)?(const|let)\s+\w+\s*=\s*(async\s+)?\(/.test(trimmed);
    const isDecorator = trimmed.startsWith('@');
    const isImport = /^(import|from)\s/.test(trimmed);
    const isType = /^(type|interface|enum)\s/.test(trimmed);

    if (isImport || isType || isDecorator) {
      result.push(line);
      continue;
    }

    if (isSig || isArrow) {
      if (inBlock && blockLines.length > 0) {
        // Keep short methods (≤5 lines) and bodies with TODOs/FIXMEs/error handling
        const hasInterest = blockLines.some(l =>
          /TODO|FIXME|HACK|throw|catch|Error\(|panic!|assert/.test(l)
        );
        if (blockLines.length <= 5 || hasInterest) {
          result.push(...blockLines);
        } else {
          result.push('  // ... body omitted');
          result.push('}');
        }
      }
      inBlock = true;
      braceDepth = 0;
      blockLines = [];
      result.push(line);
      braceDepth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
      if (braceDepth <= 0) inBlock = false;
      continue;
    }

    if (inBlock) {
      braceDepth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
      blockLines.push(line);
      if (braceDepth <= 0) {
        const hasInterest = blockLines.some(l =>
          /TODO|FIXME|HACK|throw|catch|Error\(|panic!|assert/.test(l)
        );
        if (blockLines.length <= 6 || hasInterest) {
          result.push(...blockLines);
        } else {
          result.push('  // ... body omitted');
          result.push('}');
        }
        inBlock = false;
        blockLines = [];
      }
      continue;
    }

    result.push(line);
  }

  const output = result.join('\n');
  return output.length > maxChars ? output.slice(0, maxChars) : output;
}

function compressMarkdown(text: string, maxChars: number, intent?: string): string {
  if (intent) return filterByIntent(text, intent, maxChars);

  const lines = text.split('\n');
  const result: string[] = [];
  let inCodeBlock = false;
  let inSection = false;
  let sectionLineCount = 0;
  const MAX_SECTION_LINES = 3;

  for (const line of lines) {
    if (/^```/.test(line)) {
      inCodeBlock = !inCodeBlock;
      if (inCodeBlock) {
        result.push(line);
        result.push('  // ... code block omitted');
      } else {
        result.push(line);
      }
      continue;
    }

    if (inCodeBlock) continue; // skip code block content

    // Always include headings
    if (/^#{1,6}\s/.test(line)) {
      result.push('');
      result.push(line);
      inSection = true;
      sectionLineCount = 0;
      continue;
    }

    if (inSection && sectionLineCount < MAX_SECTION_LINES) {
      result.push(line);
      sectionLineCount++;
      if (sectionLineCount === MAX_SECTION_LINES && line.trim()) {
        result.push('  ...');
      }
    }
  }

  const output = result.join('\n').trim();
  return output.length > maxChars ? output.slice(0, maxChars) : output;
}

function compressCsv(text: string, maxChars: number, intent?: string): string {
  if (intent) return filterByIntent(text, intent, maxChars);

  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length === 0) return text;

  // Detect delimiter
  const delimiters = [',', '\t', ';', '|'];
  let delimiter = ',';
  for (const d of delimiters) {
    if ((lines[0] ?? '').includes(d)) {
      delimiter = d;
      break;
    }
  }

  const header = lines[0] ?? '';
  const columns = header.split(delimiter);
  const dataRows = lines.slice(1);
  const totalRows = dataRows.length;

  const result: string[] = [
    `=== CSV: ${columns.length} columns × ${totalRows + 1} rows ===`,
    '',
    `Columns: ${columns.join(', ')}`,
    '',
    `Sample rows (first 5 of ${totalRows}):`,
  ];

  // Show first 5 data rows
  for (const row of dataRows.slice(0, 5)) {
    result.push(`  ${row.slice(0, 200)}`);
  }

  if (totalRows > 5) {
    result.push(`  ... and ${totalRows - 5} more rows`);
  }

  // Basic stats for numeric columns
  const numericStats = computeCsvStats(dataRows, columns, delimiter);
  if (numericStats.length > 0) {
    result.push('');
    result.push('Numeric column stats:');
    for (const stat of numericStats) {
      result.push(`  ${stat.column}: min=${stat.min}, max=${stat.max}, avg=${stat.avg.toFixed(2)}`);
    }
  }

  const output = result.join('\n');
  return output.length > maxChars ? output.slice(0, maxChars) : output;
}

function computeCsvStats(
  rows: string[],
  columns: string[],
  delimiter: string
): Array<{ column: string; min: number; max: number; avg: number }> {
  const stats: Array<{ column: string; min: number; max: number; avg: number }> = [];

  for (let colIdx = 0; colIdx < columns.length; colIdx++) {
    const values: number[] = [];
    for (const row of rows) {
      const cells = row.split(delimiter);
      const cell = cells[colIdx]?.trim() ?? '';
      const num = parseFloat(cell);
      if (!isNaN(num)) values.push(num);
    }
    if (values.length > rows.length * 0.5) {
      // mostly numeric
      const min = Math.min(...values);
      const max = Math.max(...values);
      const avg = values.reduce((s, v) => s + v, 0) / values.length;
      stats.push({ column: columns[colIdx] ?? `col${colIdx}`, min, max, avg });
    }
  }
  return stats;
}

function compressYaml(text: string, maxChars: number, intent?: string): string {
  if (intent) return filterByIntent(text, intent, maxChars);

  const lines = text.split('\n');
  const totalLines = lines.length;
  const result: string[] = [`=== YAML: ${totalLines} lines ===`, ''];
  let depth = 0;
  let omittedBlock = 0;
  const MAX_DEPTH = 3;

  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('#')) {
      result.push(line);
      continue;
    }
    // Calculate indent depth
    const indent = line.match(/^(\s*)/)?.[1]?.length ?? 0;
    depth = Math.floor(indent / 2);

    if (depth < MAX_DEPTH) {
      if (omittedBlock > 0) {
        result.push(`${'  '.repeat(depth)}# ... ${omittedBlock} lines omitted`);
        omittedBlock = 0;
      }
      // Mask long values (multiline blocks, secrets)
      const masked = line.replace(/:\s+.{80,}$/, ': <...long value...>');
      result.push(masked);
    } else {
      omittedBlock++;
    }
  }
  if (omittedBlock > 0) result.push(`# ... ${omittedBlock} lines omitted`);

  const output = result.join('\n');
  return output.length > maxChars ? output.slice(0, maxChars) : output;
}

function compressXml(text: string, maxChars: number, intent?: string): string {
  if (intent) return filterByIntent(text, intent, maxChars);

  // Extract tag structure only — strip text content and attributes for large nodes
  const lines = text.split('\n');
  const totalLines = lines.length;
  const result: string[] = [`=== XML: ${totalLines} lines ===`, ''];
  let depth = 0;
  let omitted = 0;
  const MAX_DEPTH = 4;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Count tag depth changes
    const opens = (trimmed.match(/<[^/?!][^>]*(?<!\/)>/g) ?? []).length;
    const closes = (trimmed.match(/<\/[^>]+>/g) ?? []).length;

    if (depth < MAX_DEPTH) {
      if (omitted > 0) {
        result.push(`${'  '.repeat(depth)}<!-- ... ${omitted} lines omitted -->`);
        omitted = 0;
      }
      // Keep tag names but truncate long attribute lists and text content
      const stripped = trimmed
        .replace(/\s{2,}/g, ' ')
        .replace(/>([^<]{50,})</g, '><...text...><')
        .slice(0, 200);
      result.push(stripped);
    } else {
      omitted++;
    }

    depth += opens - closes;
    depth = Math.max(0, depth);
  }
  if (omitted > 0) result.push(`<!-- ... ${omitted} lines omitted -->`);

  const output = result.join('\n');
  return output.length > maxChars ? output.slice(0, maxChars) : output;
}

function compressDiff(text: string, maxChars: number, intent?: string): string {
  if (intent) return filterByIntent(text, intent, maxChars);

  const lines = text.split('\n');
  const result: string[] = [];
  let currentFile = '';
  let addCount = 0;
  let removeCount = 0;
  let hunkOmitted = 0;

  const flushHunk = () => {
    if (hunkOmitted > 0) {
      result.push(`  ... ${hunkOmitted} diff lines omitted (+${addCount} -${removeCount})`);
      hunkOmitted = 0;
      addCount = 0;
      removeCount = 0;
    }
  };

  for (const line of lines) {
    if (line.startsWith('diff --git') || line.startsWith('--- ') || line.startsWith('+++ ')) {
      flushHunk();
      if (line.startsWith('diff --git')) {
        currentFile = line.replace('diff --git a/', '').split(' b/')[0] ?? line;
        result.push('');
        result.push(`FILE: ${currentFile}`);
      }
      continue;
    }

    if (line.startsWith('@@')) {
      flushHunk();
      // Show the function context from @@ line
      const ctx = line.match(/@@ .+ @@\s*(.*)/)?.[1]?.trim();
      result.push(`  ${line.slice(0, 60)}${ctx ? ` — ${ctx}` : ''}`);
      continue;
    }

    if (line.startsWith('+')) {
      addCount++;
      hunkOmitted++;
    } else if (line.startsWith('-')) {
      removeCount++;
      hunkOmitted++;
    } else if (
      line.startsWith('index ') ||
      line.startsWith('new file') ||
      line.startsWith('Binary')
    ) {
      result.push(`  ${line}`);
    }
  }
  flushHunk();

  const header = [
    `=== Git Diff ===`,
    `Files changed: ${result.filter(l => l.startsWith('FILE:')).length}`,
    '',
  ];

  const output = [...header, ...result].join('\n');
  return output.length > maxChars ? output.slice(0, maxChars) : output;
}

function compressStackTrace(text: string, maxChars: number, intent?: string): string {
  if (intent) return filterByIntent(text, intent, maxChars);

  const lines = text.split('\n');
  const result: string[] = ['=== Stack Trace ===', ''];
  const frameLines: string[] = [];
  const errorLines: string[] = [];

  for (const line of lines) {
    // Error/exception message lines
    if (/Error:|Exception:|panicked at|Traceback|signal \d+/i.test(line)) {
      errorLines.push(line.trim().slice(0, 300));
    }
    // Stack frame lines
    else if (
      /^\s+at\s/.test(line) || // JS/Java
      /^\s+File ".+", line \d+/.test(line) || // Python
      /^\s+\d+:\s+0x/.test(line) || // Rust
      /^\s*#\d+\s/.test(line) // C/C++ GDB
    ) {
      frameLines.push(line.trim().slice(0, 200));
    }
    // Cause/context lines
    else if (/caused by|note:|hint:|= note/i.test(line)) {
      result.push(line.trim().slice(0, 200));
    }
  }

  if (errorLines.length > 0) {
    result.push('ERROR:');
    result.push(...errorLines.map(l => `  ${l}`));
    result.push('');
  }

  const totalFrames = frameLines.length;
  const showTop = Math.min(5, totalFrames);
  const showBottom = Math.min(3, Math.max(0, totalFrames - showTop));

  if (totalFrames > 0) {
    result.push(`FRAMES: ${totalFrames} total`);
    result.push(...frameLines.slice(0, showTop).map(l => `  ${l}`));
    if (showBottom > 0 && totalFrames > showTop) {
      const omitted = totalFrames - showTop - showBottom;
      if (omitted > 0) result.push(`  ... ${omitted} frames omitted ...`);
      result.push(...frameLines.slice(-showBottom).map(l => `  ${l}`));
    }
  }

  const output = result.join('\n');
  return output.length > maxChars ? output.slice(0, maxChars) : output;
}

function compressEnv(text: string, maxChars: number, intent?: string): string {
  if (intent) return filterByIntent(text, intent, maxChars);

  const lines = text.split('\n');
  const result: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      result.push('');
      continue;
    }
    if (trimmed.startsWith('#')) {
      result.push(line);
      continue;
    }

    // INI section headers
    if (/^\[.+\]$/.test(trimmed)) {
      result.push(line);
      continue;
    }

    // KEY=VALUE — show key, mask value
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_.]*)\s*[=:]\s*(.*)/);
    if (match) {
      const key = match[1];
      const value = match[2] ?? '';
      // Mask sensitive-looking values
      const isSensitive = /secret|password|token|key|auth|credential|api_/i.test(key ?? '');
      const displayVal = isSensitive
        ? '***'
        : value.slice(0, 60) + (value.length > 60 ? '...' : '');
      result.push(`${key}=${displayVal}`);
    } else {
      result.push(line.slice(0, 100));
    }
  }

  const output = result.join('\n');
  return output.length > maxChars ? output.slice(0, maxChars) : output;
}

function genericTruncate(
  text: string,
  maxChars: number,
  headLines = 50,
  tailLines = 20,
  intent?: string
): string {
  if (intent) return filterByIntent(text, intent, maxChars);

  const lines = text.split('\n');
  const totalLines = lines.length;

  if (lines.length <= headLines + tailLines) {
    return text.length > maxChars ? text.slice(0, maxChars) : text;
  }

  const head = lines.slice(0, headLines).join('\n');
  const tail = lines.slice(-tailLines).join('\n');
  const omitted = totalLines - headLines - tailLines;

  return `${head}\n\n... [${omitted} lines omitted] ...\n\n${tail}`;
}

// ─── Main compress function ───────────────────────────────────────────────────

export function compress(text: string, options: CompressOptions = {}): CompressResult {
  const maxOutputChars = options.maxOutputChars ?? DEFAULT_MAX_CHARS;
  const inputChars = text.length;

  // Skip compression if below threshold
  if (inputChars < THRESHOLD_CHARS && !options.intent) {
    return {
      output: text,
      strategy: 'as-is',
      contentType: 'generic',
      inputChars,
      outputChars: inputChars,
      savedPercent: 0,
    };
  }

  const contentType = detectContentType(text);
  let strategy: CompressionStrategy = options.strategy ?? 'auto';
  let output: string;

  if (strategy === 'auto') {
    // Pick best strategy based on content type
    if (options.intent) {
      strategy = 'filter';
    } else {
      strategy = 'summarize';
    }
  }

  switch (strategy) {
    case 'filter':
      output = filterByIntent(text, options.intent ?? '', maxOutputChars);
      break;
    case 'truncate':
      output = genericTruncate(
        text,
        maxOutputChars,
        options.headLines ?? 50,
        options.tailLines ?? 20,
        options.intent
      );
      break;
    case 'summarize':
      switch (contentType) {
        case 'json':
          output = compressJson(text, maxOutputChars, options.intent);
          break;
        case 'log':
          output = compressLog(text, maxOutputChars, options.intent);
          break;
        case 'code':
          output = compressCode(text, maxOutputChars, options.intent);
          break;
        case 'markdown':
          output = compressMarkdown(text, maxOutputChars, options.intent);
          break;
        case 'csv':
          output = compressCsv(text, maxOutputChars, options.intent);
          break;
        case 'yaml':
          output = compressYaml(text, maxOutputChars, options.intent);
          break;
        case 'xml':
          output = compressXml(text, maxOutputChars, options.intent);
          break;
        case 'diff':
          output = compressDiff(text, maxOutputChars, options.intent);
          break;
        case 'stacktrace':
          output = compressStackTrace(text, maxOutputChars, options.intent);
          break;
        case 'env':
          output = compressEnv(text, maxOutputChars, options.intent);
          break;
        default:
          output = genericTruncate(text, maxOutputChars, 50, 20, options.intent);
      }
      break;
    default:
      output = text;
  }

  const outputChars = output.length;
  const savedPercent =
    inputChars > 0 ? Math.round(((inputChars - outputChars) / inputChars) * 100) : 0;

  return { output, strategy, contentType, inputChars, outputChars, savedPercent };
}
