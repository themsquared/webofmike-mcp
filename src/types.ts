export type PostHit = {
  title: string;
  slug: string;
  url: string;
  summary: string;
  date: string;
};

export type CatalogEntry = PostHit & {
  tags: string[];
  series?: string;
};

export type FullPost = CatalogEntry & {
  body: string;
  lastModified?: string;
};
