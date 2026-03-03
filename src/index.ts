#!/usr/bin/env node
/**
 * universal-context-mode — MCP server entry point
 *
 * Compresses tool outputs before they enter the AI's context window.
 * Works with Claude Code, Cursor, Windsurf, GitHub Copilot, and any MCP host.
 */

import { createServer } from './server.js';
import { logger } from './utils/logger.js';
import { loadConfigFromEnv, parseConfig } from './config/schema.js';
import { runSetup } from './adapters/generic.js';

const args = process.argv.slice(2);

// Handle setup command
if (args[0] === 'setup') {
  const ide = args[1] as string | undefined;
  runSetup(ide).catch(err => {
    logger.error('Setup failed', err);
    process.exit(1);
  });
} else {
  // Start MCP server
  startServer().catch(err => {
    logger.error('Server failed to start', err);
    process.exit(1);
  });
}

async function startServer() {
  const envConfig = loadConfigFromEnv();
  parseConfig(envConfig); // validate config on startup

  logger.info('Starting universal-context-mode MCP server', { pid: process.pid });

  const { server, transport } = createServer();

  await server.connect(transport);

  logger.info('MCP server connected via stdio');

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down`);
    await server.close();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}
