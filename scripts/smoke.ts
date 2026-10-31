import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tsxCli = resolve(root, 'node_modules/tsx/dist/cli.mjs');

function fail(message: string): never {
  console.error(`smoke FAIL: ${message}`);
  process.exit(1);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null) return value as Record<string, unknown>;
  fail(`expected object, got ${typeof value}`);
}

function textPayload(result: { content: Array<{ type: string; text?: string }> }): unknown {
  const block = result.content.find((item) => item.type === 'text' && item.text);
  if (!block?.text) fail('tool result had no text content');
  return JSON.parse(block.text);
}

async function main(): Promise<void> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [tsxCli, 'src/index.ts'],
    cwd: root,
    env: {
      PATH: process.env.PATH ?? '',
      HOME: process.env.HOME ?? '',
      NODE_PATH: process.env.NODE_PATH ?? '',
    },
    stderr: 'pipe',
  });

  const stderr = transport.stderr;
  if (stderr && typeof stderr.on === 'function') {
    stderr.on('data', (chunk: Buffer) => {
      process.stderr.write(chunk);
    });
  }

  const client = new Client({ name: 'webofmike-mcp-smoke', version: '1.0.0' });
  await client.connect(transport);

  const listed = await client.listTools();
  const names = listed.tools.map((tool) => tool.name).sort();
  if (!names.includes('search_posts') || !names.includes('get_post')) {
    fail(`expected search_posts and get_post, got ${names.join(', ') || '(none)'}`);
  }
  console.log(`tools: ${names.join(', ')}`);

  const search = await client.callTool({
    name: 'search_posts',
    arguments: { query: 'agentgateway', limit: 5 },
  });
  if (search.isError) fail(`search_posts returned isError: ${JSON.stringify(search.content)}`);

  const searchBody = asRecord(search.structuredContent ?? textPayload(search));
  const posts = searchBody.posts;
  if (!Array.isArray(posts) || posts.length === 0) {
    fail('search_posts returned no hits for "agentgateway" against live webofmike.com');
  }
  const first = asRecord(posts[0]);
  for (const field of ['title', 'slug', 'url', 'summary', 'date']) {
    if (typeof first[field] !== 'string' || !first[field]) {
      fail(`search hit missing ${field}: ${JSON.stringify(first)}`);
    }
  }
  if (!String(first.url).startsWith('https://webofmike.com/')) {
    fail(`canonical URL was not on webofmike.com: ${first.url}`);
  }
  console.log(`search_posts: ${posts.length} hits, first="${first.title}" (${first.slug})`);

  const slug = String(first.slug);
  const got = await client.callTool({
    name: 'get_post',
    arguments: { slug },
  });
  if (got.isError) fail(`get_post returned isError: ${JSON.stringify(got.content)}`);

  const post = asRecord(got.structuredContent ?? textPayload(got));
  if (post.slug !== slug) fail(`get_post slug mismatch: ${post.slug}`);
  if (typeof post.body !== 'string' || post.body.length < 200) {
    fail(`get_post body too short (${String(post.body ?? '').length} chars)`);
  }
  if (typeof post.title !== 'string' || !post.title) fail('get_post missing title');
  if (typeof post.url !== 'string' || !post.url.startsWith('https://webofmike.com/')) {
    fail(`get_post missing canonical URL: ${post.url}`);
  }
  if (typeof post.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(post.date)) {
    fail(`get_post date not YYYY-MM-DD: ${post.date}`);
  }
  if (!Array.isArray(post.tags)) fail('get_post tags missing');
  console.log(
    `get_post: ${post.title} (${post.date}) tags=${(post.tags as string[]).join(',') || '—'} series=${post.series ?? '—'} body=${post.body.length} chars`,
  );

  const missing = await client.callTool({
    name: 'get_post',
    arguments: { slug: 'this-slug-does-not-exist-webofmike-mcp' },
  });
  if (!missing.isError) fail('get_post should error for an unknown slug');
  console.log('get_post unknown slug: error (expected)');

  await client.close();
  console.log('smoke OK — both tools worked against live webofmike.com');
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.stack ?? error.message : String(error));
});
