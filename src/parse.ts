import type { CatalogEntry } from './types.ts';
import { SITE_ORIGIN } from './config.ts';

const EXCLUDED_SLUGS = new Set([
  '',
  'about',
  'privacy',
  'tags',
  'page',
  'posts',
  'categories',
  'authors',
]);

export function decodeEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) =>
      String.fromCodePoint(Number.parseInt(dec, 10)),
    );
}

export function toIsoDate(value: string | undefined): string {
  if (!value) return '';
  const trimmed = value.trim();
  const iso = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return trimmed;
  return new Date(parsed).toISOString().slice(0, 10);
}

export function canonicalUrl(slug: string): string {
  return `${SITE_ORIGIN}/${slug}/`;
}

export function markdownUrl(slug: string): string {
  return `${SITE_ORIGIN}/${slug}/index.md`;
}

export function slugFromUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url, SITE_ORIGIN);
    if (parsed.hostname !== 'webofmike.com' && parsed.hostname !== 'www.webofmike.com') {
      return undefined;
    }
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length === 0) return undefined;
    if (parts[0] === 'posts' && parts[1]) return parts[1];
    if (parts[0] === 'page' || parts[0] === 'tags') return undefined;
    if (parts.length === 1 && !EXCLUDED_SLUGS.has(parts[0])) return parts[0];
    if (parts.length === 1) return undefined;
    return undefined;
  } catch {
    return undefined;
  }
}

export function normalizeSlug(input: string): string {
  const raw = input.trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw) || raw.startsWith('/')) {
    return slugFromUrl(raw) ?? raw.replace(/^\/+|\/+$/g, '').split('/').pop() ?? '';
  }
  return raw.replace(/^\/+|\/+$/g, '').replace(/\/index\.md$/i, '');
}

function tagBetween(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return match ? decodeEntities(match[1]).trim() : '';
}

function allTags(block: string, tag: string): string[] {
  const found: string[] = [];
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'gi');
  let match: RegExpExecArray | null;
  while ((match = re.exec(block))) {
    const value = decodeEntities(match[1]).trim();
    if (value) found.push(value);
  }
  return found;
}

export function parseRss(xml: string): CatalogEntry[] {
  const posts: CatalogEntry[] = [];
  const seen = new Set<string>();
  const itemStart = /<item>/gi;
  let match: RegExpExecArray | null;
  while ((match = itemStart.exec(xml))) {
    const start = match.index;
    const encodedAt = xml.indexOf('<content:encoded>', start);
    const itemEnd = xml.indexOf('</item>', start);
    if (itemEnd === -1) break;
    const headEnd = encodedAt !== -1 && encodedAt < itemEnd ? encodedAt : itemEnd;
    const head = xml.slice(start, headEnd);
    const title = tagBetween(head, 'title');
    const link = tagBetween(head, 'link') || tagBetween(head, 'guid');
    const slug = slugFromUrl(link);
    if (!title || !slug || seen.has(slug)) continue;
    seen.add(slug);
    posts.push({
      title,
      slug,
      url: canonicalUrl(slug),
      summary: tagBetween(head, 'description'),
      date: toIsoDate(tagBetween(head, 'pubDate')),
      tags: allTags(head, 'category'),
    });
  }
  return posts;
}

export function parseLlmsTxt(text: string): {
  posts: CatalogEntry[];
  seriesBySlug: Map<string, string>;
} {
  const posts: CatalogEntry[] = [];
  const seriesBySlug = new Map<string, string>();
  const seen = new Set<string>();
  let series: string | undefined;
  for (const line of text.split(/\r?\n/)) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      const name = heading[1].trim();
      series = name.toLowerCase() === 'optional' ? undefined : name;
      continue;
    }
    const item = line.match(
      /^- \[([^\]]+)\]\((https?:\/\/[^)]+)\):\s*(.+?)\s*\((\d{4}-\d{2}-\d{2})\)\s*$/,
    );
    if (!item) continue;
    const title = item[1].trim();
    const slug = slugFromUrl(item[2]);
    if (!slug) continue;
    if (series) seriesBySlug.set(slug, series);
    if (seen.has(slug)) continue;
    seen.add(slug);
    posts.push({
      title,
      slug,
      url: canonicalUrl(slug),
      summary: item[3].trim(),
      date: item[4],
      tags: [],
      series,
    });
  }
  return { posts, seriesBySlug };
}

export function parseSitemap(xml: string): string[] {
  const slugs: string[] = [];
  const seen = new Set<string>();
  const re = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml))) {
    const slug = slugFromUrl(decodeEntities(match[1].trim()));
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    slugs.push(slug);
  }
  return slugs;
}

export function parseHomepageMarkdown(markdown: string): CatalogEntry[] {
  const posts: CatalogEntry[] = [];
  const seen = new Set<string>();
  const re =
    /^- \[([^\]]+)\]\((https?:\/\/[^)]+?)(?:index\.md)?\):\s*(.+?)\s*\((\d{4}-\d{2}-\d{2})\)/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(markdown))) {
    const slug = slugFromUrl(match[2]);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    posts.push({
      title: match[1].trim(),
      slug,
      url: canonicalUrl(slug),
      summary: match[3].trim(),
      date: match[4],
      tags: [],
    });
  }
  if (posts.length > 0) return posts;

  const alt =
    /^- (.+?): (.+?) \((\d{4}-\d{2}-\d{2})\) - markdown: (https?:\/\/\S+)/gm;
  while ((match = alt.exec(markdown))) {
    const slug = slugFromUrl(match[4]);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    posts.push({
      title: match[1].trim(),
      slug,
      url: canonicalUrl(slug),
      summary: match[2].trim(),
      date: match[3],
      tags: [],
    });
  }
  return posts;
}

export function parsePostMarkdown(markdown: string, slug: string): {
  title: string;
  summary: string;
  url: string;
  date: string;
  lastModified?: string;
  tags: string[];
  body: string;
} {
  const lines = markdown.replace(/^\uFEFF/, '').split(/\r?\n/);
  let title = '';
  let summary = '';
  const meta: Record<string, string> = {};
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i += 1;
  if (lines[i]?.startsWith('# ')) {
    title = lines[i].slice(2).trim();
    i += 1;
  }
  while (i < lines.length && lines[i].trim() === '') i += 1;
  if (lines[i]?.startsWith('> ')) {
    const quote: string[] = [];
    while (i < lines.length && (lines[i].startsWith('> ') || lines[i] === '>')) {
      quote.push(lines[i].replace(/^>\s?/, ''));
      i += 1;
    }
    summary = quote.join(' ').trim();
  }
  while (i < lines.length && lines[i].trim() === '') i += 1;
  while (i < lines.length && lines[i].startsWith('- ')) {
    const line = lines[i].slice(2);
    const colon = line.indexOf(':');
    if (colon !== -1) {
      meta[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
    }
    i += 1;
  }
  while (i < lines.length && lines[i].trim() === '') i += 1;
  const body = lines.slice(i).join('\n').trim();
  const tags = (meta.tags ?? '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
  return {
    title: title || slug,
    summary,
    url: meta['canonical url'] || canonicalUrl(slug),
    date: toIsoDate(meta.published),
    lastModified: toIsoDate(meta['last modified']) || undefined,
    tags,
    body,
  };
}

export function mergeCatalog(
  rss: CatalogEntry[],
  llms: CatalogEntry[],
  seriesBySlug: Map<string, string>,
  sitemapSlugs: string[],
): CatalogEntry[] {
  const bySlug = new Map<string, CatalogEntry>();
  for (const post of rss) bySlug.set(post.slug, { ...post });
  for (const post of llms) {
    const existing = bySlug.get(post.slug);
    if (!existing) {
      bySlug.set(post.slug, { ...post });
      continue;
    }
    if (!existing.summary && post.summary) existing.summary = post.summary;
    if (!existing.date && post.date) existing.date = post.date;
    if (!existing.title && post.title) existing.title = post.title;
  }
  for (const [slug, series] of seriesBySlug) {
    const existing = bySlug.get(slug);
    if (existing) existing.series = series;
  }
  for (const slug of sitemapSlugs) {
    if (bySlug.has(slug)) continue;
    bySlug.set(slug, {
      title: slug,
      slug,
      url: canonicalUrl(slug),
      summary: '',
      date: '',
      tags: [],
    });
  }
  return [...bySlug.values()].sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return a.slug.localeCompare(b.slug);
  });
}

export function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2);
}

export function scorePost(post: CatalogEntry, query: string, terms: string[]): number {
  if (!query.trim()) return 0;
  const title = post.title.toLowerCase();
  const slug = post.slug.toLowerCase();
  const summary = post.summary.toLowerCase();
  const tags = post.tags.map((tag) => tag.toLowerCase());
  const series = (post.series ?? '').toLowerCase();
  const haystack = `${title} ${slug} ${summary} ${tags.join(' ')} ${series}`;
  const needle = query.trim().toLowerCase();
  let score = 0;
  if (title === needle) score += 100;
  if (title.includes(needle)) score += 24;
  if (slug.includes(needle.replace(/\s+/g, '-'))) score += 18;
  if (summary.includes(needle)) score += 10;
  if (series.includes(needle)) score += 12;
  for (const term of terms) {
    if (title.includes(term)) score += 12;
    if (slug.includes(term)) score += 8;
    if (tags.some((tag) => tag.includes(term))) score += 10;
    if (series.includes(term)) score += 8;
    if (summary.includes(term)) score += 4;
  }
  if (terms.length > 1 && terms.every((term) => haystack.includes(term))) {
    score += 16;
  }
  return score;
}
