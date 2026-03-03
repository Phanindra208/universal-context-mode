import { describe, it, expect } from 'vitest';
import { compress } from '../../src/compression/strategies.js';

/**
 * Benchmark tests that verify minimum compression ratios.
 * These also generate data for BENCHMARK.md.
 */

interface BenchmarkCase {
  name: string;
  generateContent: () => string;
  expectedMinSavings: number; // %
  contentType: string;
}

const CASES: BenchmarkCase[] = [
  {
    name: 'git log --oneline (500 commits)',
    contentType: 'generic',
    expectedMinSavings: 60,
    generateContent: () =>
      Array.from({ length: 500 }, (_, i) => {
        const sha = Math.random().toString(16).slice(2, 9);
        return `${sha} feat: implement feature ${i + 1} for module ${['auth', 'api', 'db', 'ui'][i % 4]}`;
      }).join('\n'),
  },
  {
    name: 'npm list (200 packages)',
    contentType: 'generic',
    expectedMinSavings: 50,
    generateContent: () => {
      const lines = ['project@1.0.0 /path/to/project'];
      for (let i = 0; i < 200; i++) {
        lines.push(
          `├── package-${i}@${Math.floor(Math.random() * 5)}.${Math.floor(Math.random() * 10)}.0`
        );
      }
      return lines.join('\n');
    },
  },
  {
    name: 'JSON API response (large array)',
    contentType: 'json',
    expectedMinSavings: 80,
    generateContent: () =>
      JSON.stringify(
        Array.from({ length: 500 }, (_, i) => ({
          id: i,
          name: `User ${i}`,
          email: `user${i}@example.com`,
          role: ['admin', 'user', 'moderator'][i % 3],
          createdAt: new Date(Date.now() - i * 86400000).toISOString(),
          metadata: { loginCount: i * 3, lastActive: new Date().toISOString() },
        })),
        null,
        2
      ),
  },
  {
    name: 'Application logs (1000 lines)',
    contentType: 'log',
    expectedMinSavings: 70,
    generateContent: () => {
      const lines: string[] = [];
      for (let i = 0; i < 1000; i++) {
        const level = i % 50 === 0 ? 'ERROR' : i % 20 === 0 ? 'WARN' : 'INFO';
        const msg =
          level === 'ERROR'
            ? 'Connection refused to database'
            : level === 'WARN'
              ? 'Slow query detected (>500ms)'
              : `Processing request ${i}`;
        lines.push(
          `2024-01-15T10:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}Z ${level} ${msg}`
        );
      }
      return lines.join('\n');
    },
  },
  {
    name: 'TypeScript source file (large)',
    contentType: 'code',
    expectedMinSavings: 40,
    generateContent: () => {
      const methods: string[] = [];
      for (let i = 0; i < 30; i++) {
        methods.push(`
  async method${i}(param: string): Promise<string> {
    // Method ${i} implementation
    const result = await this.service.process(param);
    const transformed = result.map(item => item.value);
    const filtered = transformed.filter(v => v !== null);
    const sorted = filtered.sort();
    return sorted.join(', ');
  }`);
      }
      return `import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class LargeService {
  constructor(private service: OtherService) {}
${methods.join('\n')}
}`;
    },
  },
  {
    name: 'Markdown documentation (large)',
    contentType: 'markdown',
    expectedMinSavings: 60,
    generateContent: () => {
      const sections: string[] = [];
      for (let i = 0; i < 20; i++) {
        sections.push(`# Section ${i + 1}: Topic ${i + 1}

This section covers topic ${i + 1} in detail. There are many aspects to consider.

## Overview

The overview of section ${i + 1} includes several key points that are important
for understanding the topic thoroughly. These points build on each other.

## Details

The details section provides deeper technical information including configuration,
options, and edge cases. Pay attention to the following items listed below.

- Item 1: Important consideration for topic ${i + 1}
- Item 2: Another consideration that matters greatly
- Item 3: Final point about this configuration

\`\`\`typescript
// Example code for section ${i + 1}
const config = {
  option1: 'value',
  option2: ${i + 1},
};
\`\`\`
`);
      }
      return sections.join('\n');
    },
  },
  {
    name: 'CSV data export (500 rows)',
    contentType: 'csv',
    expectedMinSavings: 80,
    generateContent: () => {
      const header = 'id,name,email,department,salary,start_date,status';
      const rows = Array.from({ length: 500 }, (_, i) => {
        const dept = ['Engineering', 'Marketing', 'Sales', 'HR', 'Finance'][i % 5];
        return `${i + 1},Employee ${i + 1},emp${i + 1}@company.com,${dept},${60000 + i * 1000},2020-0${(i % 9) + 1}-15,active`;
      });
      return [header, ...rows].join('\n');
    },
  },
  {
    name: 'Docker ps output (100 containers)',
    contentType: 'generic',
    expectedMinSavings: 50,
    generateContent: () => {
      const lines = [
        'CONTAINER ID   IMAGE                    COMMAND                  CREATED        STATUS         PORTS                    NAMES',
      ];
      for (let i = 0; i < 100; i++) {
        const id = Math.random().toString(16).slice(2, 14);
        lines.push(
          `${id}   nginx:1.25.${i % 5}             "/docker-entrypoint.…"   2 hours ago    Up 2 hours     0.0.0.0:${8080 + i}->80/tcp   web-${i}`
        );
      }
      return lines.join('\n');
    },
  },
];

describe('Compression Benchmarks', () => {
  const results: Array<{ name: string; inputKB: number; outputKB: number; savings: number }> = [];

  for (const testCase of CASES) {
    it(`${testCase.name} saves ≥${testCase.expectedMinSavings}%`, () => {
      const content = testCase.generateContent();
      const result = compress(content, { maxOutputChars: 8000 });

      const inputKB = content.length / 1024;
      const outputKB = result.outputChars / 1024;

      results.push({
        name: testCase.name,
        inputKB,
        outputKB,
        savings: result.savedPercent,
      });

      console.log(
        `  ${testCase.name}: ${inputKB.toFixed(1)}KB → ${outputKB.toFixed(1)}KB (${result.savedPercent}% saved)`
      );

      expect(result.savedPercent).toBeGreaterThanOrEqual(testCase.expectedMinSavings);
      expect(result.outputChars).toBeLessThanOrEqual(8500); // Within target
    });
  }
});
