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

const CASCADE_RULES = `# Context Mode Rules for Windsurf Cascade

## Purpose
Route large tool outputs through context-mode to preserve the context window.

## When to Use Context-Mode Tools

Use \`context-mode.execute\` instead of direct shell commands for:
- \`git log\`, \`git diff --stat\`, \`git show\`
- \`npm list\`, \`pip list\`, \`cargo tree\`
- \`cat\` of files > 200 lines
- \`find\` with large result sets
- Test suite runners producing > 50 lines

Use \`context-mode.fetch_and_index\` + \`context-mode.search\` instead of reading documentation URLs directly.

Use \`context-mode.compress\` for any large text you already have.

## Examples

\`\`\`javascript
// Large git history
execute({ language: "shell", code: "git log --oneline -100", intent: "find commits related to authentication" })

// Large file analysis
execute_file({
  file_path: "/path/to/large.json",
  code: \`const d = JSON.parse(process.env.FILE_CONTENT);
console.log('Keys:', Object.keys(d).join(', '));
console.log('Size:', JSON.stringify(d).length, 'chars');\`
})

// Documentation lookup
fetch_and_index({ url: "https://docs.example.com/api", kb_name: "docs" })
search({ query: "authentication endpoint", kb_name: "docs" })
\`\`\`

## Stats
Run \`execute({ language: "javascript", code: "/* session stats via context-mode */" })\` to see compression stats.
`;

export class WindsurfAdapter implements BaseAdapter {
  readonly ideName = 'Windsurf';
  readonly detectionPaths = ['.windsurf'];

  async detect(cwd: string): Promise<boolean> {
    try {
      await access(join(cwd, '.windsurf'));
      return true;
    } catch {
      return false;
    }
  }

  async setup(config: AdapterConfig): Promise<SetupResult> {
    const filesCreated: string[] = [];
    const windsurfDir = join(config.projectRoot, '.windsurf');

    await mkdir(windsurfDir, { recursive: true });

    // Write MCP config
    const mcpConfigPath = join(windsurfDir, 'mcp.json');
    await writeFile(mcpConfigPath, MCP_CONFIG(config.serverPackage), 'utf8');
    filesCreated.push(mcpConfigPath);

    // Write cascade rules
    const rulesPath = join(windsurfDir, 'cascade-rules.md');
    await writeFile(rulesPath, CASCADE_RULES, 'utf8');
    filesCreated.push(rulesPath);

    return {
      ide: this.ideName,
      filesCreated,
      nextSteps: [
        '1. Restart Windsurf to load the new MCP server',
        '2. Open Settings → MCP to verify "context-mode" appears',
        '3. The Cascade rules will guide the AI to use context-mode for large outputs',
      ],
    };
  }
}
