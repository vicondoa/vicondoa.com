import rss from '@astrojs/rss';

import { getPostUrl, getPublishedPosts } from '../lib/blog';
import { SITE } from '../site.config';

export async function GET(context: { site?: URL }) {
  const posts = await getPublishedPosts({ includeDrafts: false });

  return rss({
    title: SITE.title,
    description: SITE.description,
    site: context.site ?? SITE.url,
    customData: '<language>en-us</language>',
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.publishedAt,
      link: getPostUrl(post),
      categories: post.data.topics,
    })),
  });
}
