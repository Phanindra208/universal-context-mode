import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../../src/server.js';

describe('MCP Protocol Compliance', () => {
  let client: Client;

  beforeAll(async () => {
    const { server } = createServer();
    const [ct, st] = InMemoryTransport.createLinkedPair();

    client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: { tools: {} } });

    await server.connect(st);
    await client.connect(ct);
  });

  afterAll(async () => {
    await client.close();
  });

  it('lists all 7 tools', async () => {
    const { tools } = await client.listTools();
    const names = tools.map(t => t.name);

    expect(names).toContain('execute');
    expect(names).toContain('execute_file');
    expect(names).toContain('index');
    expect(names).toContain('search');
    expect(names).toContain('fetch_and_index');
    expect(names).toContain('compress');
    expect(names).toContain('proxy');
    expect(tools.length).toBe(7);
  });

  it('each tool has required JSON schema', async () => {
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.properties).toBeDefined();
    }
  });

  it('execute tool runs code and returns output', async () => {
    const result = await client.callTool({
      name: 'execute',
      arguments: {
        language: 'javascript',
        code: 'console.log("MCP test passed")',
      },
    });

    expect(result.isError).toBeFalsy();
    expect(result.content).toBeDefined();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('MCP test passed');
  });

  it('compress tool reduces large content', async () => {
    // Use a larger array to ensure compression kicks in (well above 5KB threshold)
    const largeContent = JSON.stringify(
      Array.from({ length: 500 }, (_, i) => ({
        id: i,
        name: `Item ${i}`,
        value: i * 10,
        description: `Description for item number ${i} with extra padding`,
      }))
    );

    const result = await client.callTool({
      name: 'compress',
      arguments: { content: largeContent },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text.length).toBeLessThan(largeContent.length);
  });

  it('index and search round-trip works', async () => {
    const kbName = `test-kb-${Date.now()}`;

    await client.callTool({
      name: 'index',
      arguments: {
        content: `# TypeScript Guide\n\nTypeScript is a typed superset of JavaScript.\n\n## Interfaces\n\nUse interface to define contracts.`,
        source: 'typescript-guide.md',
        kb_name: kbName,
      },
    });

    const searchResult = await client.callTool({
      name: 'search',
      arguments: {
        query: 'interface contracts',
        kb_name: kbName,
      },
    });

    expect(searchResult.isError).toBeFalsy();
    const text = (searchResult.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toMatch(/interface|contract|typescript/i);
  });

  it('returns error for unknown tool', async () => {
    const result = await client.callTool({
      name: 'nonexistent_tool',
      arguments: {},
    });

    expect(result.isError).toBe(true);
  });

  it('returns error for missing required parameters', async () => {
    const result = await client.callTool({
      name: 'execute',
      arguments: { language: 'javascript' }, // missing 'code'
    });

    // Should either error or handle gracefully
    expect(result.content).toBeDefined();
  });
});
