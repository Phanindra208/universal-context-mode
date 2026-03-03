import { type BaseAdapter, type AdapterConfig, type SetupResult } from './base-adapter.js';
import { access, mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

const MCP_CONFIG = (pkg: string) =>
  JSON.stringify(
    {
      mcpServers: {
        'context-mode': {
          command: 'npx',
          args: ['-y', pkg],
        },
      },
    },
    null,
    2
  );

const CURSOR_RULES = `---
description: Route large outputs through context-mode to preserve context window
globs: ["**/*"]
alwaysApply: true
---

## Context Preservation Rules

When executing commands that may produce large output (>5KB), use the \`context-mode\` MCP tools:

- Instead of running shell commands directly, use \`context-mode.execute\` with \`language: "shell"\`
- Instead of reading large files, use \`context-mode.execute_file\`
- When fetching documentation, use \`context-mode.fetch_and_index\` + \`context-mode.search\`
- For any tool returning large output, use \`context-mode.compress\` to wrap it

### Commands likely to produce large output
- \`git log\`, \`git diff\`, \`cat\` large files, \`find\`, reading log files
- \`npm list\`, \`pip list\`, dependency audits, \`yarn why\`
- API responses, test suite output (>100 tests)
- Browser snapshots, web page content, database dumps

### Example usage

\`\`\`
// Instead of: bash("git log --oneline -50")
execute({ language: "shell", code: "git log --oneline -50", intent: "recent changes" })

// Instead of: read_file("package-lock.json")
execute_file({ file_path: "package-lock.json", code: "const d=JSON.parse(process.env.FILE_CONTENT); console.log('Packages:', Object.keys(d.dependencies||{}).length)" })

// Compress any large text
compress({ content: largeOutput, intent: "find error messages" })
\`\`\`
`;

export class CursorAdapter implements BaseAdapter {
  readonly ideName = 'Cursor';
  readonly detectionPaths = ['.cursor'];

  async detect(cwd: string): Promise<boolean> {
    try {
      await access(join(cwd, '.cursor'));
      return true;
    } catch {
      return false;
    }
  }

  async setup(config: AdapterConfig): Promise<SetupResult> {
    const filesCreated: string[] = [];
    const cursorDir = join(config.projectRoot, '.cursor');
    const rulesDir = join(cursorDir, 'rules');

    await mkdir(rulesDir, { recursive: true });

    // Write MCP config
    const mcpConfigPath = join(cursorDir, 'mcp.json');
    await writeFile(mcpConfigPath, MCP_CONFIG(config.serverPackage), 'utf8');
    filesCreated.push(mcpConfigPath);

    // Write rules file
    const rulesPath = join(rulesDir, 'context-mode.mdc');
    await writeFile(rulesPath, CURSOR_RULES, 'utf8');
    filesCreated.push(rulesPath);

    return {
      ide: this.ideName,
      filesCreated,
      nextSteps: [
        '1. Restart Cursor to load the new MCP server',
        '2. Open the MCP panel (Ctrl+Shift+P → "MCP: Show Panel") to verify connection',
        '3. The context-mode rules will automatically guide the agent to compress large outputs',
      ],
    };
  }
}
