import { createMcpHandler } from '@modelcontextprotocol/server';
import { createServer } from './server.ts';

/**
 * Stateless Streamable HTTP handler used by the local Node server and the
 * Netlify Function. `createServer` runs once per request; there is no MCP
 * session store.
 */
export const mcpHandler = createMcpHandler(createServer, {
  responseMode: 'json',
  legacy: 'stateless',
  onerror: (error) => {
    console.error('webofmike-mcp http error:', error);
  },
});
