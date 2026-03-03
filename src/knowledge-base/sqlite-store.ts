import { readFileSync, writeFileSync, existsSync } from 'fs';
import { DEFAULT_CONFIG } from '../config/defaults.js';
import { logger } from '../utils/logger.js';

export interface SearchResult {
  source: string;
  heading: string;
  snippet: string;
  score: number;
  kbName: string;
}

type SqlRow = Record<string, string | number | null | Uint8Array>;

interface SqlJsDatabase {
  run(sql: string, params?: (string | number | null)[]): void;
  prepare(sql: string): SqlJsStatement;
  export(): Uint8Array;
  close(): void;
}

interface SqlJsStatement {
  bind(params: (string | number | null)[]): void;
  step(): boolean;
  getAsObject(): SqlRow;
  run(params?: (string | number | null)[]): void;
  free(): void;
}

interface SqlJsStatic {
  Database: new (data?: ArrayLike<number> | Buffer | null) => SqlJsDatabase;
}

// sql.js lazy loader
let _sqlJs: SqlJsStatic | null = null;

async function getSqlJs(): Promise<SqlJsStatic> {
  if (_sqlJs) return _sqlJs;
  const { createRequire } = await import('module');
  const require = createRequire(import.meta.url);
  const initSqlJs = require('sql.js') as (config?: unknown) => Promise<SqlJsStatic>;
  _sqlJs = await initSqlJs();
  return _sqlJs;
}

export class SqliteStore {
  private db!: SqlJsDatabase;
  private dbPath: string;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(dbPath?: string) {
    this.dbPath = dbPath ?? DEFAULT_CONFIG.knowledgeBase.dbPath;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const SQL = await getSqlJs();

      if (existsSync(this.dbPath)) {
        try {
          const data = readFileSync(this.dbPath);
          this.db = new SQL.Database(data);
        } catch {
          this.db = new SQL.Database();
        }
      } else {
        this.db = new SQL.Database();
      }

      this.db.run(`
        CREATE TABLE IF NOT EXISTS chunks (
          id        INTEGER PRIMARY KEY AUTOINCREMENT,
          kb_name   TEXT    NOT NULL DEFAULT 'default',
          source    TEXT    NOT NULL,
          heading   TEXT    NOT NULL DEFAULT '',
          content   TEXT    NOT NULL,
          timestamp INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_chunks_kb ON chunks(kb_name);
      `);

      this.initialized = true;
      logger.debug('SQLite store initialized', { path: this.dbPath });
    })();

    return this.initPromise;
  }

  private persist(): void {
    try {
      const data = this.db.export();
      writeFileSync(this.dbPath, Buffer.from(data));
    } catch (err) {
      logger.warn('Failed to persist database', { err });
    }
  }

  async insertChunks(
    chunks: Array<{ content: string; heading: string }>,
    source: string,
    kbName = 'default'
  ): Promise<number> {
    await this.ensureInitialized();

    let count = 0;
    const now = Date.now();
    for (const chunk of chunks) {
      const stmt = this.db.prepare(
        'INSERT INTO chunks (kb_name, source, heading, content, timestamp) VALUES (?, ?, ?, ?, ?)'
      );
      stmt.run([kbName, source, chunk.heading, chunk.content, now]);
      stmt.free();
      count++;
    }

    this.persist();
    return count;
  }

  async search(query: string, kbName = 'default', topK = 5): Promise<SearchResult[]> {
    await this.ensureInitialized();

    const stmt = this.db.prepare(
      'SELECT source, heading, content, kb_name FROM chunks WHERE kb_name = ?'
    );
    stmt.bind([kbName]);

    const rows: Array<{ source: string; heading: string; content: string; kb_name: string }> = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as {
        source: string;
        heading: string;
        content: string;
        kb_name: string;
      };
      rows.push(row);
    }
    stmt.free();

    if (rows.length === 0) return [];

    const scored = this.bm25Score(query, rows);

    return scored.slice(0, topK).map(r => ({
      source: r.row.source,
      heading: r.row.heading,
      snippet: this.extractSnippet(r.row.content, query),
      score: r.score,
      kbName: r.row.kb_name,
    }));
  }

  private bm25Score(
    query: string,
    rows: Array<{ source: string; heading: string; content: string; kb_name: string }>
  ): Array<{ row: (typeof rows)[0]; score: number }> {
    const queryTerms = tokenize(query);
    if (queryTerms.length === 0) return [];

    const N = rows.length;
    const k1 = 1.5;
    const b = 0.75;

    const docTokens = rows.map(r => tokenize(r.content + ' ' + r.heading));
    const avgLen = docTokens.reduce((s, t) => s + t.length, 0) / Math.max(N, 1);

    // Document frequency for each query term
    const df = new Map<string, number>();
    for (const tokens of docTokens) {
      const unique = new Set(tokens);
      for (const t of unique) {
        if (queryTerms.includes(t)) df.set(t, (df.get(t) ?? 0) + 1);
      }
    }

    const scored = rows.map((row, i) => {
      const tokens = docTokens[i] ?? [];
      const docLen = tokens.length;

      const tf = new Map<string, number>();
      for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);

      let score = 0;
      for (const qt of queryTerms) {
        const termTf = tf.get(qt) ?? 0;
        if (termTf === 0) continue;

        const termDf = df.get(qt) ?? 0;
        const idf = Math.log((N - termDf + 0.5) / (termDf + 0.5) + 1);
        const tfNorm =
          (termTf * (k1 + 1)) / (termTf + k1 * (1 - b + b * (docLen / Math.max(avgLen, 1))));
        score += idf * tfNorm;
      }

      // Boost heading matches
      const headingTerms = new Set(tokenize(row.heading));
      for (const qt of queryTerms) {
        if (headingTerms.has(qt)) {
          score *= 1.5;
          break;
        }
      }

      return { row, score };
    });

    return scored.sort((a, b) => b.score - a.score).filter(s => s.score > 0);
  }

  private extractSnippet(content: string, query: string, maxLen = 300): string {
    const queryWords = query.toLowerCase().split(/\s+/);
    const contentLower = content.toLowerCase();

    let bestPos = -1;
    for (const word of queryWords) {
      const pos = contentLower.indexOf(word);
      if (pos >= 0 && (bestPos < 0 || pos < bestPos)) bestPos = pos;
    }

    if (bestPos < 0) {
      return content.slice(0, maxLen) + (content.length > maxLen ? '...' : '');
    }

    const start = Math.max(0, bestPos - 50);
    const end = Math.min(content.length, start + maxLen);
    const snippet = content.slice(start, end);
    return (start > 0 ? '...' : '') + snippet + (end < content.length ? '...' : '');
  }

  async clearKnowledgeBase(kbName = 'default'): Promise<void> {
    await this.ensureInitialized();
    const stmt = this.db.prepare('DELETE FROM chunks WHERE kb_name = ?');
    stmt.run([kbName]);
    stmt.free();
    this.persist();
    logger.info('Knowledge base cleared', { kbName });
  }

  async listKnowledgeBases(): Promise<string[]> {
    await this.ensureInitialized();
    const stmt = this.db.prepare('SELECT DISTINCT kb_name FROM chunks');
    const names: string[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as { kb_name: string };
      names.push(row.kb_name);
    }
    stmt.free();
    return names;
  }

  async getStats(kbName = 'default'): Promise<{ chunkCount: number; sources: number }> {
    await this.ensureInitialized();
    const stmt = this.db.prepare(
      'SELECT COUNT(*) as chunk_count, COUNT(DISTINCT source) as sources FROM chunks WHERE kb_name = ?'
    );
    stmt.bind([kbName]);
    stmt.step();
    const row = stmt.getAsObject() as { chunk_count: number; sources: number };
    stmt.free();
    return { chunkCount: row.chunk_count, sources: row.sources };
  }

  close(): void {
    if (this.initialized) {
      this.persist();
      this.db.close();
    }
  }
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOP_WORDS.has(t))
    .map(stem);
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
]);

function stem(word: string): string {
  if (word.endsWith('ing') && word.length > 6) return word.slice(0, -3);
  if (word.endsWith('tion') && word.length > 6) return word.slice(0, -3);
  if (word.endsWith('ness') && word.length > 6) return word.slice(0, -4);
  if (word.endsWith('ment') && word.length > 6) return word.slice(0, -4);
  if (word.endsWith('er') && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('ly') && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('ed') && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('s') && word.length > 3 && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}
