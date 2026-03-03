import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteStore } from '../../src/knowledge-base/sqlite-store.js';
import { Indexer } from '../../src/knowledge-base/indexer.js';
import { Searcher } from '../../src/knowledge-base/searcher.js';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { unlinkSync, existsSync } from 'fs';

function tempDbPath() {
  return join(tmpdir(), `ucm-test-${randomBytes(8).toString('hex')}.db`);
}

describe('SqliteStore', () => {
  let store: SqliteStore;
  let dbPath: string;

  beforeEach(() => {
    dbPath = tempDbPath();
    store = new SqliteStore(dbPath);
  });

  afterEach(() => {
    store.close();
    try {
      if (existsSync(dbPath)) unlinkSync(dbPath);
    } catch {
      /* best effort */
    }
  });

  it('initializes without error', () => {
    expect(store).toBeDefined();
  });

  it('inserts and retrieves chunks', async () => {
    const chunks = [
      { content: 'The quick brown fox', heading: 'Animals' },
      { content: 'Jumps over the lazy dog', heading: 'Animals' },
    ];
    const count = await store.insertChunks(chunks, 'test.md', 'default');
    expect(count).toBe(2);
  });

  it('searches with BM25 ranking', async () => {
    await store.insertChunks(
      [
        { content: 'Authentication and authorization in web applications', heading: 'Security' },
        { content: 'Database connection pooling with PostgreSQL', heading: 'Database' },
        { content: 'JWT tokens for authentication', heading: 'Auth' },
      ],
      'docs.md',
      'default'
    );

    const results = await store.search('authentication JWT', 'default', 5);
    expect(results.length).toBeGreaterThan(0);
    // Auth-related results should rank higher
    expect(results[0]!.heading).toMatch(/Security|Auth/);
  });

  it('isolates knowledge bases', async () => {
    await store.insertChunks(
      [{ content: 'Angular framework documentation', heading: 'Angular' }],
      'angular.md',
      'angular-docs'
    );
    await store.insertChunks(
      [{ content: 'React framework documentation', heading: 'React' }],
      'react.md',
      'react-docs'
    );

    const angularResults = await store.search('framework', 'angular-docs', 5);
    const reactResults = await store.search('framework', 'react-docs', 5);

    expect(angularResults.every(r => r.kbName === 'angular-docs')).toBe(true);
    expect(reactResults.every(r => r.kbName === 'react-docs')).toBe(true);
  });

  it('clears knowledge base', async () => {
    await store.insertChunks(
      [{ content: 'Some content to clear', heading: 'Test' }],
      'test.md',
      'clearme'
    );

    await store.clearKnowledgeBase('clearme');
    const results = await store.search('content', 'clearme', 5);
    expect(results.length).toBe(0);
  });

  it('returns correct stats', async () => {
    await store.insertChunks(
      [
        { content: 'Chunk 1 content here', heading: 'H1' },
        { content: 'Chunk 2 content here', heading: 'H2' },
      ],
      'source1.md',
      'stats-test'
    );
    await store.insertChunks(
      [{ content: 'Chunk 3 content here', heading: 'H3' }],
      'source2.md',
      'stats-test'
    );

    const stats = await store.getStats('stats-test');
    expect(stats.chunkCount).toBe(3);
    expect(stats.sources).toBe(2);
  });
});

describe('Indexer', () => {
  let store: SqliteStore;
  let indexer: Indexer;

  beforeEach(() => {
    store = new SqliteStore(tempDbPath());
    indexer = new Indexer(store);
  });

  afterEach(() => {
    store.close();
  });

  it('indexes markdown with heading-aware chunks', async () => {
    const markdown = `# Introduction\n\nThis is the intro.\n\n## Installation\n\nRun npm install.\n\n## Usage\n\nImport and use.`;
    const result = await indexer.indexText(markdown, { source: 'readme.md' });

    expect(result.chunksIndexed).toBeGreaterThan(0);
    expect(result.source).toBe('readme.md');
  });

  it('skips empty chunks', async () => {
    const result = await indexer.indexText('   \n\n   \n\n   ', { source: 'empty.md' });
    expect(result.chunksIndexed).toBe(0);
  });

  it('indexes URL source', async () => {
    const result = await indexer.indexUrl(
      'https://example.com',
      '# Docs\n\nContent here with more words.'
    );
    expect(result.source).toBe('https://example.com');
  });
});

describe('Searcher', () => {
  let store: SqliteStore;
  let searcher: Searcher;

  beforeEach(async () => {
    store = new SqliteStore(tempDbPath());
    const indexer = new Indexer(store);

    await indexer.indexText(
      `
# TypeScript Interfaces
Interfaces define contracts for objects. Use interface keyword.

## Optional Properties
Properties can be optional with the ? modifier.

# TypeScript Classes
Classes support inheritance and encapsulation.

## Access Modifiers
Public, private, and protected modifiers control visibility.
    `,
      { source: 'typescript.md' }
    );

    searcher = new Searcher(store);
  });

  afterEach(() => {
    store.close();
  });

  it('finds relevant results', async () => {
    const response = await searcher.search('interface optional properties');
    expect(response.results.length).toBeGreaterThan(0);
  });

  it('formats results as readable text', async () => {
    const response = await searcher.search('classes inheritance');
    const formatted = searcher.formatResults(response);

    expect(formatted).toContain('Result');
    expect(formatted).toContain('Source');
  });

  it('handles empty query gracefully', async () => {
    const response = await searcher.search('');
    expect(response.results).toEqual([]);
  });
});
