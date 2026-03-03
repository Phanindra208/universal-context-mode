import { describe, it, expect } from 'vitest';
import { chunkMarkdown, reconstructFromChunks } from '../../src/compression/chunker.js';

describe('chunkMarkdown', () => {
  it('returns empty array for empty string', () => {
    expect(chunkMarkdown('')).toEqual([]);
  });

  it('returns single chunk for text without headings', () => {
    const text = 'Hello world. This is some content without any headings.';
    const chunks = chunkMarkdown(text);
    expect(chunks.length).toBe(1);
    expect(chunks[0]!.content).toContain('Hello world');
    expect(chunks[0]!.level).toBe(0);
  });

  it('splits on h1 headings', () => {
    const text = `# Section One\n\nContent one.\n\n# Section Two\n\nContent two.`;
    const chunks = chunkMarkdown(text);
    expect(chunks.length).toBe(2);
    expect(chunks[0]!.heading).toBe('Section One');
    expect(chunks[1]!.heading).toBe('Section Two');
  });

  it('splits on h2 and h3 headings', () => {
    const text = `## Part A\n\nContent A.\n\n### Sub Part\n\nSub content.\n\n## Part B\n\nContent B.`;
    const chunks = chunkMarkdown(text);
    expect(chunks.length).toBe(3);
    expect(chunks[0]!.level).toBe(2);
    expect(chunks[1]!.level).toBe(3);
    expect(chunks[2]!.level).toBe(2);
  });

  it('preserves code blocks intact (never splits mid-code-block)', () => {
    const text = `# Heading\n\nSome text.\n\n\`\`\`javascript\nconst x = 1;\nconst y = 2;\n// This should stay in the same chunk\n\`\`\`\n\nAfter code.`;
    const chunks = chunkMarkdown(text);

    // Find the chunk with the code block
    const codeChunk = chunks.find(c => c.content.includes('```'));
    expect(codeChunk).toBeDefined();
    expect(codeChunk!.content).toContain('const x = 1;');
    expect(codeChunk!.content).toContain('const y = 2;');
  });

  it('does not split inside code block on # character', () => {
    const text = `# Title\n\nSome text.\n\n\`\`\`bash\n# This is a bash comment\necho "hello"\n\`\`\`\n\n# Next Section`;
    const chunks = chunkMarkdown(text);

    // The bash comment line should NOT create a new chunk
    const bashChunk = chunks.find(c => c.content.includes('bash comment'));
    expect(bashChunk).toBeDefined();
    // Next Section should be a separate chunk
    expect(chunks.some(c => c.heading === 'Next Section')).toBe(true);
  });

  it('splits large chunks at paragraph boundaries', () => {
    const bigContent = Array.from(
      { length: 50 },
      (_, i) => `Paragraph ${i + 1}: ${`word `.repeat(40)}`
    ).join('\n\n');
    const text = `# Large Section\n\n${bigContent}`;

    const chunks = chunkMarkdown(text, 1000);
    expect(chunks.length).toBeGreaterThan(1);
    // All chunks should be within size limit (with some tolerance for boundary detection)
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThan(1500);
    }
  });

  it('records correct line numbers', () => {
    const text = `# First\n\nContent.\n\n# Second\n\nMore content.`;
    const chunks = chunkMarkdown(text);
    expect(chunks[0]!.startLine).toBe(0);
    expect(chunks[1]!.startLine).toBeGreaterThan(0);
  });
});

describe('reconstructFromChunks', () => {
  it('reconstructs markdown from chunks', () => {
    const text = `# Section One\n\nContent one.\n\n## Section Two\n\nContent two.`;
    const chunks = chunkMarkdown(text);
    const reconstructed = reconstructFromChunks(chunks);

    // Should preserve headings and content
    expect(reconstructed).toContain('Section One');
    expect(reconstructed).toContain('Content one.');
    expect(reconstructed).toContain('Section Two');
    expect(reconstructed).toContain('Content two.');
  });
});
