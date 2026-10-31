export const SITE_ORIGIN = 'https://webofmike.com';
export const USER_AGENT =
  'webofmike-mcp/1.0 (public blog reader; +https://webofmike.com)';

export const SERVER_NAME = 'webofmike';
export const SERVER_VERSION = '1.0.0';
export const SERVER_TITLE = 'Web of Mike';

export const RSS_URL = `${SITE_ORIGIN}/index.xml`;
export const LLMS_URL = `${SITE_ORIGIN}/llms.txt`;
export const SITEMAP_URL = `${SITE_ORIGIN}/sitemap.xml`;
export const HOMEPAGE_MD_URL = `${SITE_ORIGIN}/index.md`;

export const CATALOG_TTL_MS = 10 * 60 * 1000;
export const FETCH_TIMEOUT_MS = 20_000;
export const DEFAULT_SEARCH_LIMIT = 8;
export const MAX_SEARCH_LIMIT = 25;

export const SERVER_INSTRUCTIONS = [
  'Search and read public posts from Mike Moore\'s engineering blog at https://webofmike.com.',
  'Use search_posts first to find articles by topic, then get_post with a slug for the full markdown.',
  'Canonical URLs are root-level: https://webofmike.com/<slug>/.',
  'Cite as: Mike Moore, "<Post Title>", Web of Mike (webofmike.com), <date>.',
  'This server only reads public content. There is no login and no write tool.',
].join(' ');
