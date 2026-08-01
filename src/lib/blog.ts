import { getCollection, type CollectionEntry } from 'astro:content';

import { SITE } from '../site.config';
export { getPageCount, getPostsPage } from './pagination';

export type BlogPost = CollectionEntry<'blog'>;

export interface Topic {
  count: number;
  label: string;
  posts: BlogPost[];
  slug: string;
}

export async function getPublishedPosts(): Promise<BlogPost[]> {
  const posts = await getCollection('blog');

  return posts.sort(
    (left, right) =>
      right.data.publishedAt.valueOf() - left.data.publishedAt.valueOf() ||
      left.data.title.localeCompare(right.data.title),
  );
}

export function getPostSlug(post: BlogPost): string {
  return post.id
    .replace(/\.(md|mdx)$/i, '')
    .replace(/\/index$/i, '')
    .replace(/^\/|\/$/g, '')
    .split('/')
    .pop()!;
}

export function getPostDatePath(post: BlogPost): string {
  const published = post.data.publishedAt;
  const year = published.getUTCFullYear();
  const month = `${published.getUTCMonth() + 1}`.padStart(2, '0');

  return `${year}/${month}`;
}

export function getPostUrl(post: BlogPost): string {
  return `/blog/${getPostDatePath(post)}/${getPostSlug(post)}`;
}

export function getReadingTime(post: BlogPost): number {
  const words = (post.body ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#>*_[\]()`~|-]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

  return Math.max(1, Math.ceil(words / 220));
}

export function slugifyTopic(topic: string): string {
  return topic
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .trim()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function getTopics(posts: BlogPost[]): Topic[] {
  const topics = new Map<string, Topic>();

  for (const post of posts) {
    for (const label of post.data.topics) {
      const slug = slugifyTopic(label);
      const existing = topics.get(slug);

      if (existing) {
        existing.count += 1;
        existing.posts.push(post);
      } else {
        topics.set(slug, { count: 1, label, posts: [post], slug });
      }
    }
  }

  return [...topics.values()].sort((left, right) =>
    left.label.localeCompare(right.label),
  );
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat(SITE.locale, {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
    year: 'numeric',
  }).format(date);
}
