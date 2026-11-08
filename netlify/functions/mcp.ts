import { mcpHandler } from '../../src/handler.ts';

/**
 * Netlify Function 2.0 entry: stateless Streamable HTTP MCP.
 * Public, no auth. GET/DELETE are rejected so the function never opens a
 * long-lived SSE stream (that 502s on serverless).
 */
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'Accept, Content-Type, MCP-Protocol-Version, Mcp-Session-Id, Mcp-Method, Mcp-Name, Last-Event-ID',
  'Access-Control-Max-Age': '86400',
};

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default async function mcp(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== 'POST') {
    return withCors(
      new Response('Method not allowed', {
        status: 405,
        headers: { Allow: 'POST, OPTIONS' },
      }),
    );
  }
  return withCors(await mcpHandler.fetch(request));
}

export const config = {
  path: '/mcp',
};
