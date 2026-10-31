import { createServer as createHttpServer } from 'node:http';
import { createMcpHandler } from '@modelcontextprotocol/server';
import {
  localhostHostValidation,
  localhostOriginValidation,
  toNodeHandler,
} from '@modelcontextprotocol/node';
import { SERVER_NAME, SERVER_VERSION } from './config.ts';
import { createServer } from './server.ts';

const port = Number.parseInt(process.env.PORT ?? '43147', 10);
const host = process.env.HOST ?? '127.0.0.1';
const mcpPath = process.env.MCP_PATH ?? '/mcp';
const loopback = host === '127.0.0.1' || host === 'localhost' || host === '::1';

const handler = createMcpHandler(createServer, { responseMode: 'json' });
const nodeHandler = toNodeHandler(handler, {
  onerror: (error) => {
    console.error('webofmike-mcp http error:', error);
  },
});
const validateHost = loopback ? localhostHostValidation() : undefined;
const validateOrigin = loopback ? localhostOriginValidation() : undefined;

function landingPage(baseUrl: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>webofmike MCP v1</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: #111114; color: #ecece8; }
    main { max-width: 40rem; margin: 0 auto; padding: 3rem 1.25rem 4rem; }
    h1 { font-size: 1.6rem; letter-spacing: -0.03em; margin: 0 0 0.4rem; }
    p, li { line-height: 1.55; color: #c8c8c2; }
    a { color: #8fd0ff; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; background: #1c1c22; padding: 0.1em 0.35em; border-radius: 4px; }
    .card { border: 1px solid #2a2a32; border-radius: 12px; padding: 1rem 1.1rem; margin: 1.25rem 0; background: #17171c; }
    .muted { color: #8d8d86; font-size: 0.92rem; }
  </style>
</head>
<body>
  <main>
    <p class="muted">MCP server v${SERVER_VERSION} · public posts only</p>
    <h1>Web of Mike</h1>
    <p>Live index of <a href="https://webofmike.com">webofmike.com</a>. Two read-only tools: <code>search_posts</code> and <code>get_post</code>.</p>
    <div class="card">
      <p><strong>Streamable HTTP endpoint</strong></p>
      <p><code>${baseUrl}${mcpPath}</code></p>
      <p class="muted">No authentication. Point Cursor, Claude, Gemini, or MCP Inspector at this URL after you deploy it on HTTPS.</p>
    </div>
    <ul>
      <li><code>search_posts</code> — query → title, slug, URL, summary, date</li>
      <li><code>get_post</code> — slug → markdown body, canonical URL, title, date, tags/series</li>
    </ul>
    <p class="muted">Health: <a href="/health">/health</a>. Stdio: <code>npx tsx src/index.ts</code>.</p>
  </main>
</body>
</html>`;
}

const httpServer = createHttpServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? `${host}:${port}`}`);
  if (url.pathname === '/' || url.pathname === '/index.html') {
    const proto = String(req.headers['x-forwarded-proto'] ?? 'http').split(',')[0];
    const forwardedHost = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? `${host}:${port}`);
    const html = landingPage(`${proto}://${forwardedHost}`);
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        ok: true,
        name: SERVER_NAME,
        version: SERVER_VERSION,
        tools: ['search_posts', 'get_post'],
        source: 'https://webofmike.com',
      }),
    );
    return;
  }
  if (url.pathname === mcpPath || url.pathname.startsWith(`${mcpPath}/`)) {
    if (validateHost && !validateHost(req, res)) return;
    if (validateOrigin && !validateOrigin(req, res)) return;
    void nodeHandler(req, res);
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

httpServer.listen(port, host, () => {
  console.error(`webofmike-mcp v1 HTTP on http://${host}:${port}  MCP ${mcpPath}`);
});

const shutdown = async () => {
  httpServer.close();
  await handler.close();
  process.exit(0);
};

process.on('SIGINT', () => {
  void shutdown();
});
process.on('SIGTERM', () => {
  void shutdown();
});
