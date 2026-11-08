import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mcpHandler } from '../src/handler.ts';
import netlifyMcp from '../netlify/functions/mcp.ts';

const MCP_URL = 'https://mcp.webofmike.com/mcp';
const ACCEPT = 'application/json, text/event-stream';

after(async () => {
  await mcpHandler.close();
});

function rpcBody(method: string, id: number, params: Record<string, unknown> = {}) {
  return {
    jsonrpc: '2.0',
    id,
    method,
    params,
  };
}

function parseJsonRpc(text: string, contentType: string | null): Record<string, unknown> {
  if (contentType?.includes('text/event-stream')) {
    const dataLines = text
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .filter(Boolean);
    assert.ok(dataLines.length > 0, `SSE response had no data line: ${text}`);
    return JSON.parse(dataLines[dataLines.length - 1]) as Record<string, unknown>;
  }
  return JSON.parse(text) as Record<string, unknown>;
}

async function anonymousPost(
  fetchImpl: (request: Request) => Promise<Response>,
  body: unknown,
): Promise<{ response: Response; rpc: Record<string, unknown> }> {
  const headers = new Headers({
    'content-type': 'application/json',
    accept: ACCEPT,
  });
  assert.equal(headers.has('authorization'), false, 'test request must be anonymous');

  const request = new Request(MCP_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  assert.equal(request.headers.get('authorization'), null);

  const response = await fetchImpl(request);
  const text = await response.text();
  const rpc = parseJsonRpc(text, response.headers.get('content-type'));
  return { response, rpc };
}

function assertInitializeOk(rpc: Record<string, unknown>) {
  assert.equal(rpc.jsonrpc, '2.0');
  assert.equal(rpc.error, undefined, `initialize returned error: ${JSON.stringify(rpc.error)}`);
  const result = rpc.result as Record<string, unknown> | undefined;
  assert.ok(result, 'initialize missing result');
  const serverInfo = result.serverInfo as Record<string, unknown> | undefined;
  assert.equal(serverInfo?.name, 'webofmike');
  assert.equal(typeof result.protocolVersion, 'string');
}

function assertToolsListOk(rpc: Record<string, unknown>) {
  assert.equal(rpc.jsonrpc, '2.0');
  assert.equal(rpc.error, undefined, `tools/list returned error: ${JSON.stringify(rpc.error)}`);
  const result = rpc.result as { tools?: Array<{ name?: string }> } | undefined;
  assert.ok(result, 'tools/list missing result');
  const names = (result.tools ?? []).map((tool) => tool.name);
  assert.ok(names.includes('search_posts'), `missing search_posts in ${names.join(', ')}`);
  assert.ok(names.includes('get_post'), `missing get_post in ${names.join(', ')}`);
}

test('anonymous POST initialize succeeds (shared handler)', async () => {
  const { response, rpc } = await anonymousPost(mcpHandler.fetch, rpcBody('initialize', 1, {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'webofmike-mcp-test', version: '0.0.0' },
  }));
  assert.equal(response.status, 200);
  assertInitializeOk(rpc);
});

test('anonymous POST tools/list succeeds (shared handler)', async () => {
  const { response, rpc } = await anonymousPost(mcpHandler.fetch, rpcBody('tools/list', 2));
  assert.equal(response.status, 200);
  assertToolsListOk(rpc);
});

test('anonymous POST initialize succeeds (Netlify function)', async () => {
  const { response, rpc } = await anonymousPost(netlifyMcp, rpcBody('initialize', 1, {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'webofmike-mcp-test', version: '0.0.0' },
  }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assertInitializeOk(rpc);
});

test('anonymous POST tools/list succeeds (Netlify function)', async () => {
  const { response, rpc } = await anonymousPost(netlifyMcp, rpcBody('tools/list', 2));
  assert.equal(response.status, 200);
  assertToolsListOk(rpc);
});
