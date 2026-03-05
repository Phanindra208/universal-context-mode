import { type BaseAdapter, type AdapterConfig, type SetupResult } from './base-adapter.js';
import { access, mkdir, writeFile, readFile } from 'fs/promises';
import { join } from 'path';

const MCP_CONFIG = (pkg: string) => ({
  'mcp.servers': {
    'context-mode': {
      command: 'npx',
      args: ['-y', pkg],
      type: 'stdio',
    },
  },
});

const COPILOT_INSTRUCTIONS = `# Context-Mode Instructions for GitHub Copilot

## When working with large outputs

Route large tool outputs through context-mode MCP tools to preserve the context window:

### For shell commands producing large output
Use \`context-mode.execute\` with an intent parameter:
\`\`\`
context-mode.execute({
  language: "shell",
  code: "git log --oneline -50",
  intent: "find commits related to the bug fix"
})
\`\`\`

### For large files
Use \`context-mode.execute_file\`:
\`\`\`
context-mode.execute_file({
  file_path: "/absolute/path/to/file.json",
  code: "const d = JSON.parse(process.env.FILE_CONTENT); console.log(Object.keys(d).join(', '))"
})
\`\`\`

### For documentation
Fetch and index, then search:
\`\`\`
context-mode.fetch_and_index({ url: "https://docs.example.com" })
context-mode.search({ query: "relevant topic" })
\`\`\`

### For any large text
\`\`\`
context-mode.compress({ content: largeText, intent: "find error messages" })
\`\`\`

## Commands that often produce large output
- git log, git diff, git show
- npm list, yarn why, pip list, cargo tree
- cat on files > 200 lines
- find with many results
- Test suite output
- API responses

### Check savings report
Use \`context-mode.report\` anytime to see how much context was saved this session and verify the plugin is working:
\`\`\`
context-mode.report()
\`\`\`
`;

export class CopilotAdapter implements BaseAdapter {
  readonly ideName = 'GitHub Copilot (VS Code)';
  readonly detectionPaths = ['.vscode'];

  async detect(cwd: string): Promise<boolean> {
    try {
      await access(join(cwd, '.vscode'));
      return true;
    } catch {
      return false;
    }
  }

  async setup(config: AdapterConfig): Promise<SetupResult> {
    const filesCreated: string[] = [];
    const vscodeDir = join(config.projectRoot, '.vscode');

    await mkdir(vscodeDir, { recursive: true });

    // Merge into existing settings.json or create new one
    const settingsPath = join(vscodeDir, 'settings.json');
    let existingSettings: Record<string, unknown> = {};

    try {
      const content = await readFile(settingsPath, 'utf8');
      existingSettings = JSON.parse(content) as Record<string, unknown>;
    } catch {
      // No existing settings
    }

    const mcpConfig = MCP_CONFIG(config.serverPackage);
    const mergedSettings = { ...existingSettings, ...mcpConfig };

    await writeFile(settingsPath, JSON.stringify(mergedSettings, null, 2), 'utf8');
    filesCreated.push(settingsPath);

    // Write Copilot instructions
    const githubDir = join(config.projectRoot, '.github');
    await mkdir(githubDir, { recursive: true });
    const instructionsPath = join(githubDir, 'copilot-instructions.md');
    await writeFile(instructionsPath, COPILOT_INSTRUCTIONS, 'utf8');
    filesCreated.push(instructionsPath);

    return {
      ide: this.ideName,
      filesCreated,
      nextSteps: [
        '1. Reload VS Code (Ctrl+Shift+P → "Developer: Reload Window")',
        '2. Verify MCP: open Command Palette → "GitHub Copilot: Show MCP Servers"',
        '3. The copilot-instructions.md will guide Copilot to use context-mode tools',
        '',
        'Note: GitHub Copilot MCP support requires VS Code 1.99+ and Copilot subscription.',
      ],
    };
  }
}
