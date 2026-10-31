import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { catalog, CatalogError } from './catalog.ts';
import {
  DEFAULT_SEARCH_LIMIT,
  MAX_SEARCH_LIMIT,
  SERVER_INSTRUCTIONS,
  SERVER_NAME,
  SERVER_TITLE,
  SERVER_VERSION,
} from './config.ts';
import type { FullPost, PostHit } from './types.ts';

const postHitSchema = z.object({
  title: z.string(),
  slug: z.string(),
  url: z.string(),
  summary: z.string(),
  date: z.string(),
});

const searchOutputSchema = z.object({
  query: z.string(),
  count: z.number().int(),
  posts: z.array(postHitSchema),
});

const getPostOutputSchema = z.object({
  title: z.string(),
  slug: z.string(),
  url: z.string(),
  date: z.string(),
  summary: z.string(),
  tags: z.array(z.string()),
  series: z.string().optional(),
  lastModified: z.string().optional(),
  body: z.string(),
});

function toolError(message: string) {
  return {
    content: [{ type: 'text' as const, text: message }],
    isError: true,
  };
}

function toolResult<T>(value: T) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: value as Record<string, unknown>,
  };
}

function formatSearch(query: string, posts: PostHit[]): z.infer<typeof searchOutputSchema> {
  return { query, count: posts.length, posts };
}

function formatPost(post: FullPost): z.infer<typeof getPostOutputSchema> {
  return {
    title: post.title,
    slug: post.slug,
    url: post.url,
    date: post.date,
    summary: post.summary,
    tags: post.tags,
    ...(post.series ? { series: post.series } : {}),
    ...(post.lastModified ? { lastModified: post.lastModified } : {}),
    body: post.body,
  };
}

export function createServer(): McpServer {
  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
      title: SERVER_TITLE,
      websiteUrl: 'https://webofmike.com',
      description:
        'Search and read public posts from Mike Moore\'s engineering blog at webofmike.com.',
    },
    {
      instructions: SERVER_INSTRUCTIONS,
      capabilities: { tools: {} },
    },
  );

  server.registerTool(
    'search_posts',
    {
      title: 'Search Web of Mike posts',
      description:
        'Search public posts on webofmike.com by topic, title, slug, tag, or series. Returns title, slug, canonical URL, summary, and date. Empty query returns the newest posts.',
      inputSchema: z.object({
        query: z
          .string()
          .describe(
            'Search string, for example "agentgateway", "MCP guardrails", or "kagent substrate". Empty string returns the newest posts.',
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_SEARCH_LIMIT)
          .optional()
          .describe(`Maximum hits to return (default ${DEFAULT_SEARCH_LIMIT}, max ${MAX_SEARCH_LIMIT}).`),
      }),
      outputSchema: searchOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ query, limit }) => {
      try {
        const posts = await catalog.search(query, limit ?? DEFAULT_SEARCH_LIMIT);
        return toolResult(formatSearch(query, posts));
      } catch (error) {
        const message = error instanceof CatalogError ? error.message : 'search_posts failed';
        return toolError(message);
      }
    },
  );

  server.registerTool(
    'get_post',
    {
      title: 'Get a Web of Mike post',
      description:
        'Fetch the full markdown body of one public post by slug (or canonical URL), plus title, date, tags, and series when present.',
      inputSchema: z.object({
        slug: z
          .string()
          .min(1)
          .describe(
            'Post slug such as what-is-an-mcp-gateway, or a canonical URL like https://webofmike.com/what-is-an-mcp-gateway/',
          ),
      }),
      outputSchema: getPostOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ slug }) => {
      try {
        const post = await catalog.getPost(slug);
        return toolResult(formatPost(post));
      } catch (error) {
        if (error instanceof CatalogError) return toolError(error.message);
        const status = error instanceof Error ? error.message : 'get_post failed';
        return toolError(
          status.includes('HTTP 404')
            ? `No post found for slug "${slug}". Use search_posts to find a valid slug.`
            : status,
        );
      }
    },
  );

  return server;
}
