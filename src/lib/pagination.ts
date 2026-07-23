import { SITE } from '../site.config';

export function getPageCount(
  totalItems: number,
  pageSize = SITE.postsPerPage,
): number {
  return Math.max(1, Math.ceil(totalItems / pageSize));
}

export function getPostsPage<T>(
  items: T[],
  page: number,
  pageSize = SITE.postsPerPage,
): T[] {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}
