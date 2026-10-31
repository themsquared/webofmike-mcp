import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createServer } from './server.ts';

void serveStdio(createServer, {
  onerror: (error) => {
    console.error('webofmike-mcp stdio error:', error);
  },
});

console.error('webofmike-mcp v1 running on stdio (live index: https://webofmike.com)');
