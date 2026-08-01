// @ts-check
import { defineConfig } from 'astro/config';

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

import { isPreviewBuild } from './src/lib/deploy.ts';

// A preview build carries unpublished posts and serves a robots.txt that
// disallows everything, so publishing a sitemap alongside it would only
// advertise URLs that do not exist on the live site.
const preview = isPreviewBuild();

export default defineConfig({
  site: 'https://vicondoa.com',
  output: 'static',
  trailingSlash: 'never',
  redirects: {
    '/blog': '/',
  },
  integrations: preview ? [mdx()] : [mdx(), sitemap()],
  markdown: {
    shikiConfig: {
      theme: 'github-dark',
      wrap: true,
    },
  },
});
