import { type BaseAdapter, type AdapterConfig, type SetupResult } from './base-adapter.js';
import { access, mkdir, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

/**
 * Eclipse IDE adapter via Continue.dev plugin.
 * Continue.dev is the primary MCP-capable AI extension for Eclipse.
 * Install it from: https://plugins.continuedev.org
 *
 * Focused on embedded C++ workflows:
 * - Cross-compilation output (arm-none-eabi-g++, avr-gcc, xtensa-gcc)
 * - Linker map files and memory layout
 * - GDB / OpenOCD / J-Link debug sessions
 * - Build system output (make, cmake, ninja)
 * - Static analysis (cppcheck, MISRA, clang-tidy)
 * - Serial/UART log dumps
 */

const CONTINUE_MCP_ENTRY = (pkg: string) => ({
  name: 'context-mode',
  command: 'npx',
  args: ['-y', pkg],
});

const ECLIPSE_INSTRUCTIONS = `# Context-Mode Rules for Eclipse (Embedded C++)

## Purpose
Route large tool outputs through context-mode to preserve context window when working on embedded C++ projects.

## When to Use Context-Mode Tools

### Build output (cross-compiler, make, cmake)
Large build logs from arm-none-eabi-g++, avr-gcc, xtensa-gcc etc. produce thousands of lines.
Use \`context-mode.compress\` with an intent to extract only what matters:
\`\`\`
context-mode.compress({
  content: buildOutput,
  intent: "find compiler errors and warnings"
})

context-mode.compress({
  content: makeOutput,
  intent: "find linker errors and undefined references"
})
\`\`\`

### Linker map files (.map)
Map files are huge — use execute_file to extract only the sections you need:
\`\`\`
context-mode.execute_file({
  file_path: "/path/to/firmware.map",
  code: \`
    const lines = process.env.FILE_CONTENT.split('\\n');
    const memSections = lines.filter(l => /\\.text|\\.data|\\.bss|\\.rodata/.test(l));
    const overflow = lines.filter(l => l.includes('overflow') || l.includes('region'));
    console.log('Memory sections:', memSections.slice(0, 30).join('\\n'));
    console.log('Overflow warnings:', overflow.join('\\n'));
  \`
})
\`\`\`

### Binary size analysis (arm-none-eabi-size, avr-size)
\`\`\`
context-mode.execute({
  language: "shell",
  code: "arm-none-eabi-size -A build/firmware.elf",
  intent: "show flash and RAM usage per section"
})
\`\`\`

### GDB / OpenOCD debug output
Debug sessions produce large backtraces and register dumps:
\`\`\`
context-mode.compress({
  content: gdbOutput,
  intent: "find crash location and faulting instruction"
})

context-mode.compress({
  content: openocdLog,
  intent: "find connection errors and flash programming result"
})
\`\`\`

### Serial / UART log dumps
\`\`\`
context-mode.execute_file({
  file_path: "/path/to/uart.log",
  code: \`
    const lines = process.env.FILE_CONTENT.split('\\n');
    const errors = lines.filter(l => /error|fault|assert|panic|hardfault/i.test(l));
    const last = lines.slice(-50);
    console.log('Errors:', errors.join('\\n'));
    console.log('Last 50 lines:', last.join('\\n'));
  \`
})
\`\`\`

### cppcheck / MISRA / clang-tidy output
\`\`\`
context-mode.compress({
  content: staticAnalysisOutput,
  intent: "find critical errors and MISRA violations"
})
\`\`\`

### Objdump / readelf output
\`\`\`
context-mode.execute({
  language: "shell",
  code: "arm-none-eabi-objdump -h build/firmware.elf",
  intent: "show section headers and sizes"
})

context-mode.execute({
  language: "shell",
  code: "arm-none-eabi-readelf -s build/firmware.elf | grep -E 'FUNC|OBJECT'",
  intent: "list symbols and their sizes"
})
\`\`\`

### Large header files / device headers
\`\`\`
context-mode.execute_file({
  file_path: "/path/to/stm32f4xx.h",
  code: \`
    const content = process.env.FILE_CONTENT;
    const registers = content.match(/#define\\s+\\w+_BASE[^\\n]*/g) || [];
    console.log('Base addresses:', registers.slice(0, 30).join('\\n'));
  \`
})
\`\`\`

## Commands that produce large output in embedded C++ projects
- \`make all\`, \`cmake --build\`, \`ninja\` (full rebuild)
- \`arm-none-eabi-objdump -d firmware.elf\` (disassembly)
- \`arm-none-eabi-nm --size-sort firmware.elf\` (symbol table)
- \`cppcheck --enable=all src/\` (static analysis)
- \`openocd -f interface/stlink.cfg\` (debug session logs)
- Reading \`*.map\`, \`*.lst\`, \`compile_commands.json\` files

## Check savings report
\`\`\`
context-mode.report()
\`\`\`
`;

function mergeContinueConfig(
  existing: Record<string, unknown>,
  newEntry: ReturnType<typeof CONTINUE_MCP_ENTRY>
): Record<string, unknown> {
  const mcpServers = (existing.mcpServers as Array<Record<string, unknown>>) ?? [];
  const filtered = mcpServers.filter((s) => s['name'] !== 'context-mode');
  return {
    ...existing,
    mcpServers: [...filtered, newEntry],
  };
}

export class EclipseAdapter implements BaseAdapter {
  readonly ideName = 'Eclipse (Embedded C++)';
  readonly detectionPaths = ['.project', '.cproject'];

  async detect(cwd: string): Promise<boolean> {
    try {
      // Eclipse CDT projects always have .cproject
      await access(join(cwd, '.cproject'));
      return true;
    } catch {
      try {
        // Fall back to any Eclipse project
        await access(join(cwd, '.project'));
        return true;
      } catch {
        return false;
      }
    }
  }

  async setup(config: AdapterConfig): Promise<SetupResult> {
    const filesCreated: string[] = [];

    // Continue.dev config lives in ~/.continue/config.json
    const continueDir = join(homedir(), '.continue');
    await mkdir(continueDir, { recursive: true });

    const configPath = join(continueDir, 'config.json');
    let existingConfig: Record<string, unknown> = {};

    try {
      const content = await readFile(configPath, 'utf8');
      existingConfig = JSON.parse(content) as Record<string, unknown>;
    } catch {
      // No existing config — start fresh
    }

    const merged = mergeContinueConfig(existingConfig, CONTINUE_MCP_ENTRY(config.serverPackage));
    await writeFile(configPath, JSON.stringify(merged, null, 2), 'utf8');
    filesCreated.push(configPath);

    // Write Eclipse-specific instructions to .context-mode/ in project root
    const cmDir = join(config.projectRoot, '.context-mode');
    await mkdir(cmDir, { recursive: true });
    const instructionsPath = join(cmDir, 'embedded-cpp-rules.md');
    await writeFile(instructionsPath, ECLIPSE_INSTRUCTIONS, 'utf8');
    filesCreated.push(instructionsPath);

    return {
      ide: this.ideName,
      filesCreated,
      nextSteps: [
        '1. Install Continue.dev for Eclipse:',
        '   Help → Eclipse Marketplace → search "Continue"',
        '   Or: https://plugins.continuedev.org',
        '',
        '2. Restart Eclipse after installing Continue.dev',
        '',
        '3. Continue.dev will auto-load the MCP server from:',
        `   ${join(homedir(), '.continue', 'config.json')}`,
        '',
        '4. Open Continue panel (View → Continue) and verify context-mode appears',
        '',
        '5. Reference .context-mode/embedded-cpp-rules.md for usage examples',
        '   focused on embedded C++ workflows (build output, GDB, UART logs, etc.)',
        '',
        'Note: Continue.dev requires Eclipse 2023-03+ and Java 17+.',
      ],
    };
  }
}
