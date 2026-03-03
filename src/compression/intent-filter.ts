/**
 * Intent-driven output filtering using TF-IDF scoring.
 * No LLM calls — pure algorithmic relevance ranking.
 */

import { chunkMarkdown } from './chunker.js';

export interface ScoredChunk {
  content: string;
  heading: string;
  score: number;
}

// Porter stemmer — minimal implementation for the most common English suffixes
function stem(word: string): string {
  word = word.toLowerCase();
  // Step 1a
  if (word.endsWith('sses')) word = word.slice(0, -2);
  else if (word.endsWith('ies')) word = word.slice(0, -2);
  else if (word.endsWith('ss')) {
    /* no-op */
  } else if (word.endsWith('s')) word = word.slice(0, -1);
  // Step 1b
  if (word.endsWith('eed')) {
    if (word.length > 4) word = word.slice(0, -1);
  } else if (word.endsWith('ed') && /[aeiou]/.test(word.slice(0, -2))) {
    word = word.slice(0, -2);
  } else if (word.endsWith('ing') && /[aeiou]/.test(word.slice(0, -3))) {
    word = word.slice(0, -3);
  }
  // Step 2 (simplified)
  const step2Map: Array<[string, string]> = [
    ['ational', 'ate'],
    ['tional', 'tion'],
    ['enci', 'ence'],
    ['anci', 'ance'],
    ['izer', 'ize'],
    ['iser', 'ise'],
    ['alism', 'al'],
    ['ation', 'ate'],
    ['ator', 'ate'],
    ['alism', 'al'],
    ['ness', ''],
    ['ment', ''],
    ['ful', ''],
    ['ous', ''],
    ['ive', ''],
    ['ize', ''],
    ['ise', ''],
  ];
  for (const [suffix, replacement] of step2Map) {
    if (word.endsWith(suffix) && word.length > suffix.length + 2) {
      word = word.slice(0, -suffix.length) + replacement;
      break;
    }
  }
  return word;
}

const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'is',
  'it',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'and',
  'or',
  'but',
  'not',
  'with',
  'this',
  'that',
  'are',
  'was',
  'be',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'can',
  'from',
  'by',
  'as',
  'if',
  'then',
  'than',
  'so',
  'into',
  'up',
  'out',
  'about',
  'all',
  'any',
  'some',
  'more',
  'also',
  'when',
  'where',
  'which',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOP_WORDS.has(t))
    .map(stem);
}

function computeTfIdf(
  queryTerms: string[],
  chunks: Array<{ content: string; heading: string }>
): ScoredChunk[] {
  // Build corpus term frequencies
  const chunkTokens = chunks.map(c => tokenize(c.content + ' ' + c.heading));
  const n = chunks.length;

  // IDF: log(N / (1 + df))
  const df: Map<string, number> = new Map();
  for (const tokens of chunkTokens) {
    const unique = new Set(tokens);
    for (const t of unique) {
      df.set(t, (df.get(t) ?? 0) + 1);
    }
  }

  const scored: ScoredChunk[] = chunks.map((chunk, i) => {
    const tokens = chunkTokens[i] ?? [];
    const tf: Map<string, number> = new Map();
    for (const t of tokens) {
      tf.set(t, (tf.get(t) ?? 0) + 1);
    }

    let score = 0;
    for (const qt of queryTerms) {
      const termTf = (tf.get(qt) ?? 0) / Math.max(tokens.length, 1);
      const termDf = df.get(qt) ?? 0;
      const idf = Math.log((n + 1) / (termDf + 1)) + 1;
      score += termTf * idf;
    }

    // Boost if heading contains query terms
    const headingTokens = new Set(tokenize(chunk.heading));
    for (const qt of queryTerms) {
      if (headingTokens.has(qt)) {
        score *= 1.5;
        break;
      }
    }

    return { content: chunk.content, heading: chunk.heading, score };
  });

  return scored.sort((a, b) => b.score - a.score);
}

export function filterByIntent(
  text: string,
  intent: string,
  maxOutputChars: number = 8000
): string {
  const chunks = chunkMarkdown(text);
  if (chunks.length === 0) {
    // Fall back to line-based chunking for non-markdown content
    return filterLinesByIntent(text, intent, maxOutputChars);
  }

  const queryTerms = tokenize(intent);
  const scored = computeTfIdf(queryTerms, chunks);

  const selected: string[] = [];
  let totalChars = 0;

  for (const chunk of scored) {
    if (totalChars + chunk.content.length > maxOutputChars) break;
    const section = chunk.heading ? `## ${chunk.heading}\n${chunk.content}` : chunk.content;
    selected.push(section);
    totalChars += section.length;
  }

  if (selected.length === 0 && scored.length > 0) {
    // Return at least the top result truncated
    const top = scored[0]!;
    return top.content.slice(0, maxOutputChars);
  }

  return selected.join('\n\n');
}

function filterLinesByIntent(text: string, intent: string, maxOutputChars: number): string {
  const queryTerms = tokenize(intent);
  const lines = text.split('\n');

  const scored = lines.map((line, i) => {
    const lineTerms = tokenize(line);
    let score = 0;
    for (const qt of queryTerms) {
      if (lineTerms.includes(qt)) score++;
    }
    return { line, score, i };
  });

  // Sort by relevance but preserve original order for ties
  const relevant = scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score || a.i - b.i);

  // Add context lines around matches
  const lineIndices = new Set<number>();
  for (const { i } of relevant) {
    for (let j = Math.max(0, i - 2); j <= Math.min(lines.length - 1, i + 2); j++) {
      lineIndices.add(j);
    }
  }

  const resultLines = Array.from(lineIndices)
    .sort((a, b) => a - b)
    .map(i => lines[i] ?? '');

  const result = resultLines.join('\n');
  return result.length > maxOutputChars ? result.slice(0, maxOutputChars) : result;
}
