import { type BaseAdapter, type AdapterConfig, type SetupResult } from './base-adapter.js';
import { access } from 'fs/promises';
import { join } from 'path';

export class ClaudeCodeAdapter implements BaseAdapter {
  readonly ideName = 'Claude Code';
  readonly detectionPaths = ['.claude'];

  async detect(cwd: string): Promise<boolean> {
    try {
      await access(join(cwd, '.claude'));
      return true;
    } catch {
      return false;
    }
  }

  async setup(config: AdapterConfig): Promise<SetupResult> {
    await Promise.resolve();
    const filesCreated: string[] = [];

    // Claude Code uses CLI to add MCP servers
    // The install script handles this
    const installScriptPath = join(config.projectRoot, 'templates', 'claude-code', 'install.sh');

    return {
      ide: this.ideName,
      filesCreated,
      nextSteps: [
        'Run the following command to add context-mode to Claude Code:',
        '',
        `  claude mcp add context-mode -- npx -y ${config.serverPackage}`,
        '',
        'Or run the install script:',
        `  bash ${installScriptPath}`,
        '',
        'Verify installation:',
        '  claude mcp list',
      ],
    };
  }
}
