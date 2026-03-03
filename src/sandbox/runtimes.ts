import { execFileSync } from 'child_process';

export type Language =
  | 'javascript'
  | 'js'
  | 'typescript'
  | 'ts'
  | 'python'
  | 'py'
  | 'shell'
  | 'bash'
  | 'sh'
  | 'ruby'
  | 'rb'
  | 'go'
  | 'rust'
  | 'rs'
  | 'php'
  | 'perl'
  | 'pl'
  | 'r';

export interface Runtime {
  language: Language;
  command: string;
  args: (filePath: string) => string[];
  extension: string;
  available: boolean;
}

function isAvailable(cmd: string): boolean {
  try {
    execFileSync(cmd, ['--version'], { stdio: 'ignore', timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

function hasBun(): boolean {
  try {
    execFileSync('bun', ['--version'], { stdio: 'ignore', timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

const bunAvailable = hasBun();

export const RUNTIMES: Runtime[] = [
  {
    language: 'javascript',
    command: bunAvailable ? 'bun' : 'node',
    args: f => [f],
    extension: 'js',
    available: bunAvailable || isAvailable('node'),
  },
  {
    language: 'js',
    command: bunAvailable ? 'bun' : 'node',
    args: f => [f],
    extension: 'js',
    available: bunAvailable || isAvailable('node'),
  },
  {
    language: 'typescript',
    command: bunAvailable ? 'bun' : 'tsx',
    args: f => [f],
    extension: 'ts',
    available: bunAvailable || isAvailable('tsx'),
  },
  {
    language: 'ts',
    command: bunAvailable ? 'bun' : 'tsx',
    args: f => [f],
    extension: 'ts',
    available: bunAvailable || isAvailable('tsx'),
  },
  {
    language: 'python',
    command: 'python3',
    args: f => [f],
    extension: 'py',
    available: isAvailable('python3') || isAvailable('python'),
  },
  {
    language: 'py',
    command: 'python3',
    args: f => [f],
    extension: 'py',
    available: isAvailable('python3'),
  },
  {
    language: 'shell',
    command: 'bash',
    args: f => [f],
    extension: 'sh',
    available: isAvailable('bash'),
  },
  {
    language: 'bash',
    command: 'bash',
    args: f => [f],
    extension: 'sh',
    available: isAvailable('bash'),
  },
  {
    language: 'sh',
    command: 'sh',
    args: f => [f],
    extension: 'sh',
    available: true, // sh is nearly always available
  },
  {
    language: 'ruby',
    command: 'ruby',
    args: f => [f],
    extension: 'rb',
    available: isAvailable('ruby'),
  },
  {
    language: 'rb',
    command: 'ruby',
    args: f => [f],
    extension: 'rb',
    available: isAvailable('ruby'),
  },
  {
    language: 'go',
    command: 'go',
    args: f => ['run', f],
    extension: 'go',
    available: isAvailable('go'),
  },
  {
    language: 'php',
    command: 'php',
    args: f => [f],
    extension: 'php',
    available: isAvailable('php'),
  },
  {
    language: 'perl',
    command: 'perl',
    args: f => [f],
    extension: 'pl',
    available: isAvailable('perl'),
  },
  {
    language: 'pl',
    command: 'perl',
    args: f => [f],
    extension: 'pl',
    available: isAvailable('perl'),
  },
  {
    language: 'r',
    command: 'Rscript',
    args: f => [f],
    extension: 'r',
    available: isAvailable('Rscript'),
  },
];

export function getRuntimeForLanguage(language: Language): Runtime | undefined {
  return RUNTIMES.find(r => r.language === language && r.available);
}

export function getAvailableRuntimes(): Runtime[] {
  return RUNTIMES.filter(r => r.available);
}
