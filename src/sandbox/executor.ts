import { execFile } from 'child_process';
import { writeFile, unlink, mkdtemp } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { promisify } from 'util';
import { type Language, getRuntimeForLanguage } from './runtimes.js';
import { buildSandboxEnv } from './auth-passthrough.js';
import { logger } from '../utils/logger.js';

const execFileAsync = promisify(execFile);

export interface ExecuteOptions {
  language: Language;
  code: string;
  timeoutMs?: number;
  memoryMB?: number;
  env?: Record<string, string>;
  stdin?: string;
}

export interface ExecuteResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  language: Language;
  durationMs: number;
}

const MAX_OUTPUT_BYTES = 10 * 1024 * 1024; // 10MB hard limit

export async function executeCode(options: ExecuteOptions): Promise<ExecuteResult> {
  const { language, code, timeoutMs = 30_000, memoryMB = 256 } = options;

  const runtime = getRuntimeForLanguage(language);
  if (!runtime) {
    throw new Error(
      `Runtime for language "${language}" is not available. ` +
        `Make sure the required interpreter is installed.`
    );
  }

  // Create temp directory and file
  const tmpDir = await mkdtemp(join(tmpdir(), 'ucm-exec-'));
  const filePath = join(tmpDir, `script.${runtime.extension}`);

  try {
    await writeFile(filePath, code, 'utf8');

    // Build command with memory limit for Node.js runtimes
    const command = runtime.command;
    let args = runtime.args(filePath);

    if (command === 'node' && memoryMB) {
      args = [`--max-old-space-size=${memoryMB}`, ...args];
    }

    const env = buildSandboxEnv(options.env);
    const startTime = Date.now();

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let exitCode = 0;

    try {
      const result = await execFileAsync(command, args, {
        timeout: timeoutMs,
        env,
        maxBuffer: MAX_OUTPUT_BYTES,
        cwd: tmpDir,
      });
      stdout = result.stdout;
      stderr = result.stderr;
    } catch (err: unknown) {
      const execError = err as {
        stdout?: string;
        stderr?: string;
        killed?: boolean;
        code?: number;
      };
      stdout = execError.stdout ?? '';
      stderr = execError.stderr ?? '';
      timedOut = execError.killed ?? false;
      exitCode = execError.code ?? 1;

      if (timedOut) {
        stderr = `[Execution timed out after ${timeoutMs}ms]\n${stderr}`;
      }
    }

    const durationMs = Date.now() - startTime;
    logger.debug('Code executed', { language, durationMs, exitCode, timedOut });

    return { stdout, stderr, exitCode, timedOut, language, durationMs };
  } finally {
    // Cleanup temp files
    try {
      await unlink(filePath);
      const { rmdir } = await import('fs/promises');
      await rmdir(tmpDir);
    } catch {
      // Best effort cleanup
    }
  }
}

export async function executeFile(
  filePath: string,
  userCode: string,
  options: Omit<ExecuteOptions, 'code' | 'language'>
): Promise<ExecuteResult> {
  // Read the file content and pass as FILE_CONTENT env var
  const { readFile } = await import('fs/promises');
  let fileContent: string;
  try {
    fileContent = await readFile(filePath, 'utf8');
  } catch (err) {
    throw new Error(`Cannot read file "${filePath}": ${String(err)}`);
  }

  // The user code processes FILE_CONTENT
  return executeCode({
    ...options,
    language: 'javascript',
    code: userCode,
    env: {
      ...(options.env ?? {}),
      FILE_CONTENT: fileContent,
      FILE_PATH: filePath,
    },
  });
}
