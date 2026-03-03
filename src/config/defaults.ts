export interface ContextModeConfig {
  compression: {
    thresholdBytes: number; // Don't compress below this size
    maxOutputBytes: number; // Target max output size
    defaultStrategy: 'auto' | 'truncate' | 'summarize' | 'filter';
    headLines: number; // Lines to keep from start (generic truncate)
    tailLines: number; // Lines to keep from end (generic truncate)
  };
  sandbox: {
    timeoutMs: number;
    memoryMB: number;
    preferBun: boolean;
  };
  knowledgeBase: {
    dbPath: string; // Will be set to OS temp by default
    maxChunkSize: number; // Max chars per chunk
    chunkOverlap: number; // Overlap between chunks
    searchTopK: number; // Default search results
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
  };
}

import { tmpdir } from 'os';
import { join } from 'path';

export const DEFAULT_CONFIG: ContextModeConfig = {
  compression: {
    thresholdBytes: 5 * 1024, // 5KB
    maxOutputBytes: 8 * 1024, // 8KB target output
    defaultStrategy: 'auto',
    headLines: 50,
    tailLines: 20,
  },
  sandbox: {
    timeoutMs: 30_000,
    memoryMB: 256,
    preferBun: true,
  },
  knowledgeBase: {
    dbPath: join(tmpdir(), 'universal-context-mode.db'),
    maxChunkSize: 1500,
    chunkOverlap: 100,
    searchTopK: 5,
  },
  logging: {
    level: 'info',
  },
};
