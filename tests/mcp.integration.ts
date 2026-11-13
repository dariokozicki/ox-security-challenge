import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Scan } from '../src/shared/types.js';

test('real MCP client starts a scan and retrieves the same HTTP evidence', async () => {
  const client = new Client({ name: 'trace-verification', version: '1' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['dist/server/mcp.js'],
    cwd: process.cwd(),
  });
  try {
    await client.connect(transport);
    assert.deepEqual((await client.listTools()).tools.map((t) => t.name).sort(), [
      'get_action_plan',
      'get_evidence',
      'get_scan',
      'list_scans',
      'recheck_scan',
      'start_scan',
    ]);
    const args = { mode: 'demo', requestKey: randomUUID() };
    const created = await client.callTool({ name: 'start_scan', arguments: args });
    assert.ok(!created.isError);
    let scan = (created.structuredContent as { scan: Scan }).scan;
    const repeated = await client.callTool({ name: 'start_scan', arguments: args });
    assert.equal((repeated.structuredContent as { scan: Scan }).scan.id, scan.id);
    const deadline = Date.now() + 100000;
    while (['queued', 'running'].includes(scan.status) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const progress = await client.callTool({ name: 'get_scan', arguments: { scanId: scan.id } });
      scan = (progress.structuredContent as { scan: Scan }).scan;
    }
    assert.equal(scan.status, 'completed');
    const evidence = await client.callTool({
      name: 'get_evidence',
      arguments: { scanId: scan.id },
    });
    const http = await fetch(`http://127.0.0.1:4310/api/scans/${scan.id}/export`);
    assert.deepEqual(evidence.structuredContent, await http.json());
    assert.equal(scan.analyzers.source?.findings.length, 3);
    assert.equal(scan.analyzers.dependencies?.findings.length, 1);
    assert.equal(scan.analyzers.research?.findings.length, 1);
    const plan = await client.callTool({ name: 'get_action_plan', arguments: { scanId: scan.id } });
    assert.ok(!plan.isError);
    assert.equal(
      (plan.structuredContent as { revision: string }).revision,
      scan.snapshot?.revision,
    );
    const reassessed = await client.callTool({
      name: 'recheck_scan',
      arguments: {
        scanId: scan.id,
        requestKey: randomUUID(),
      },
    });
    assert.ok(!reassessed.isError);
    assert.equal(
      (reassessed.structuredContent as { scan: Scan }).scan.snapshot?.revision,
      scan.snapshot?.revision,
    );
  } finally {
    await client.close();
  }
});
