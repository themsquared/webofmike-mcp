import {
  CATALOG_TTL_MS,
  DEFAULT_SEARCH_LIMIT,
  FETCH_TIMEOUT_MS,
  HOMEPAGE_MD_URL,
  LLMS_URL,
  MAX_SEARCH_LIMIT,
  RSS_URL,
  SITEMAP_URL,
  USER_AGENT,
} from './config.ts';
import {
  canonicalUrl,
  markdownUrl,
  mergeCatalog,
  normalizeSlug,
  parseHomepageMarkdown,
  parseLlmsTxt,
  parsePostMarkdown,
  parseRss,
  parseSitemap,
  scorePost,
  tokenize,
} from './parse.ts';
import type { CatalogEntry, FullPost, PostHit } from './types.ts';

export class CatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogError';
  }
}

async function fetchText(url: string, accept: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: accept,
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: 'follow',
  });
  if (!response.ok) {
    throw new CatalogError(`GET ${url} failed: HTTP ${response.status}`);
  }
  return response.text();
}

async function fetchOptional(url: string, accept: string): Promise<string | undefined> {
  try {
    return await fetchText(url, accept);
  } catch (error) {
    console.error(`webofmike-mcp: optional fetch failed for ${url}:`, error);
    return undefined;
  }
}

function toHit(post: CatalogEntry): PostHit {
  return {
    title: post.title,
    slug: post.slug,
    url: post.url,
    summary: post.summary,
    date: post.date,
  };
}

export class BlogCatalog {
  private posts: CatalogEntry[] = [];
  private fetchedAt = 0;
  private inflight: Promise<CatalogEntry[]> | undefined;

  async list(): Promise<CatalogEntry[]> {
    const fresh = Date.now() - this.fetchedAt < CATALOG_TTL_MS;
    if (fresh && this.posts.length > 0) return this.posts;
    if (this.inflight) return this.inflight;
    this.inflight = this.refresh().finally(() => {
      this.inflight = undefined;
    });
    return this.inflight;
  }

  async search(query: string, limit = DEFAULT_SEARCH_LIMIT): Promise<PostHit[]> {
    const posts = await this.list();
    const capped = Math.min(MAX_SEARCH_LIMIT, Math.max(1, limit));
    const trimmed = query.trim();
    if (!trimmed) return posts.slice(0, capped).map(toHit);
    const terms = tokenize(trimmed);
    return posts
      .map((post) => ({ post, score: scorePost(post, trimmed, terms) }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score || b.post.date.localeCompare(a.post.date))
      .slice(0, capped)
      .map((row) => toHit(row.post));
  }

  async getPost(slugInput: string): Promise<FullPost> {
    const slug = normalizeSlug(slugInput);
    if (!slug) {
      throw new CatalogError('Provide a post slug, such as what-is-an-mcp-gateway.');
    }
    const [markdown, posts] = await Promise.all([
      fetchText(markdownUrl(slug), 'text/markdown, text/plain;q=0.9, */*;q=0.1'),
      this.list().catch(() => [] as CatalogEntry[]),
    ]);
    const parsed = parsePostMarkdown(markdown, slug);
    const indexed = posts.find((post) => post.slug === slug);
    if (!parsed.body && !parsed.title) {
      throw new CatalogError(`No markdown body at ${markdownUrl(slug)}`);
    }
    return {
      title: parsed.title || indexed?.title || slug,
      slug,
      url: parsed.url || indexed?.url || canonicalUrl(slug),
      summary: parsed.summary || indexed?.summary || '',
      date: parsed.date || indexed?.date || '',
      tags: parsed.tags.length > 0 ? parsed.tags : (indexed?.tags ?? []),
      series: indexed?.series,
      lastModified: parsed.lastModified,
      body: parsed.body || markdown.trim(),
    };
  }

  private async refresh(): Promise<CatalogEntry[]> {
    const [rssXml, llmsTxt, sitemapXml, homepageMd] = await Promise.all([
      fetchOptional(RSS_URL, 'application/rss+xml, application/xml, text/xml'),
      fetchOptional(LLMS_URL, 'text/plain'),
      fetchOptional(SITEMAP_URL, 'application/xml, text/xml'),
      fetchOptional(HOMEPAGE_MD_URL, 'text/markdown, text/plain'),
    ]);

    const rss = rssXml ? parseRss(rssXml) : [];
    const llms = llmsTxt ? parseLlmsTxt(llmsTxt) : { posts: [], seriesBySlug: new Map<string, string>() };
    const sitemapSlugs = sitemapXml ? parseSitemap(sitemapXml) : [];
    const homepage = homepageMd ? parseHomepageMarkdown(homepageMd) : [];

    const merged = mergeCatalog(
      rss.length > 0 ? rss : homepage,
      llms.posts,
      llms.seriesBySlug,
      sitemapSlugs,
    );

    if (merged.length === 0) {
      if (this.posts.length > 0) return this.posts;
      throw new CatalogError(
        'Could not index webofmike.com from RSS, llms.txt, sitemap, or homepage markdown.',
      );
    }

    this.posts = merged;
    this.fetchedAt = Date.now();
    console.error(`webofmike-mcp: indexed ${merged.length} posts from live webofmike.com`);
    return merged;
  }
}

export const catalog = new BlogCatalog();
