import { Indexer } from '../knowledge-base/indexer.js';
import { getStore } from './index-content.js';
import { DEFAULT_CONFIG } from '../config/defaults.js';

export interface FetchAndIndexToolInput {
  url: string;
  kb_name?: string;
  chunk_size?: number;
}

async function fetchAndConvertToMarkdown(url: string): Promise<string> {
  // Use built-in fetch (Node 18+)
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'universal-context-mode/0.1.0 (MCP Server)',
      Accept: 'text/html,application/xhtml+xml,text/plain',
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText} fetching ${url}`);
  }

  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('text/plain') || contentType.includes('text/markdown')) {
    return await response.text();
  }

  const htmlContent = await response.text();

  // Convert HTML to Markdown using turndown (no JSDOM dependency)
  try {
    const TurndownService = (await import('turndown')).default;
    const turndown = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
    });
    return turndown.turndown(htmlContent);
  } catch {
    // Basic HTML stripping fallback
    return htmlContent
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

export async function fetchAndIndexTool(input: FetchAndIndexToolInput): Promise<string> {
  const { url, kb_name = 'default', chunk_size } = input;

  let markdown: string;
  try {
    markdown = await fetchAndConvertToMarkdown(url);
  } catch (err) {
    return `Error fetching "${url}": ${String(err)}`;
  }

  const store = getStore();
  const indexer = new Indexer(store);

  const result = await indexer.indexUrl(url, markdown, {
    kbName: kb_name,
    chunkSize: chunk_size ?? DEFAULT_CONFIG.knowledgeBase.maxChunkSize,
  });

  const stats = await store.getStats(kb_name);
  const wordCount = markdown.split(/\s+/).length;

  return [
    `Fetched and indexed "${url}"`,
    `Content: ~${wordCount.toLocaleString()} words converted to ${result.chunksIndexed} searchable chunks.`,
    `Knowledge base "${kb_name}": ${stats.chunkCount} total chunks from ${stats.sources} source(s).`,
    `Use search to query: search({ query: "your question", kb_name: "${kb_name}" })`,
  ].join('\n');
}
