import { cwd } from 'process';
import { ClaudeCodeAdapter } from './claude-code.js';
import { CursorAdapter } from './cursor.js';
import { WindsurfAdapter } from './windsurf.js';
import { CopilotAdapter } from './copilot.js';
import { type BaseAdapter, type SetupResult } from './base-adapter.js';

const ADAPTERS: BaseAdapter[] = [
  new ClaudeCodeAdapter(),
  new CursorAdapter(),
  new WindsurfAdapter(),
  new CopilotAdapter(),
];

const SERVER_PACKAGE = 'universal-context-mode';

async function detectIde(projectRoot: string): Promise<BaseAdapter | null> {
  for (const adapter of ADAPTERS) {
    if (await adapter.detect(projectRoot)) {
      return adapter;
    }
  }
  return null;
}

export async function runSetup(ideHint?: string): Promise<void> {
  const projectRoot = cwd();
  const config = { projectRoot, serverPackage: SERVER_PACKAGE };

  let adapter: BaseAdapter | null = null;

  if (ideHint) {
    const hint = ideHint.toLowerCase();
    adapter =
      ADAPTERS.find(
        a =>
          a.ideName.toLowerCase().includes(hint) ||
          hint.includes(a.ideName.toLowerCase().split(' ')[0]?.toLowerCase() ?? '')
      ) ?? null;

    if (!adapter) {
      console.error(`Unknown IDE: "${ideHint}"`);
      console.error(`Available: ${ADAPTERS.map(a => a.ideName).join(', ')}`);
      process.exit(1);
    }
  } else {
    adapter = await detectIde(projectRoot);

    if (!adapter) {
      printManualSetup();
      return;
    }

    console.log(`Detected IDE: ${adapter.ideName}`);
  }

  console.log(`Setting up context-mode for ${adapter.ideName}...`);
  const result: SetupResult = await adapter.setup(config);

  if (result.filesCreated.length > 0) {
    console.log('\nFiles created:');
    for (const f of result.filesCreated) {
      console.log(`  ✓ ${f}`);
    }
  }

  console.log('\nNext steps:');
  for (const step of result.nextSteps) {
    console.log(step ? `  ${step}` : '');
  }
}

function printManualSetup(): void {
  console.log(`
No supported IDE detected in current directory.
Supported IDEs: ${ADAPTERS.map(a => a.ideName).join(', ')}

Manual setup options:

  npx universal-context-mode setup claude-code
  npx universal-context-mode setup cursor
  npx universal-context-mode setup windsurf
  npx universal-context-mode setup copilot

Or add to any MCP-compatible host with:
  {
    "mcpServers": {
      "context-mode": {
        "command": "npx",
        "args": ["-y", "universal-context-mode"]
      }
    }
  }
`);
}
