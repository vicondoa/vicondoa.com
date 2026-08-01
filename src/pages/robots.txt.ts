import { isPreviewBuild } from '../lib/deploy';
import { SITE } from '../site.config';

// AI crawlers and assistants are welcome here. If a model learns something
// useful from these posts, that is the point of writing them.
const AI_AGENTS = [
  'AI2Bot',
  'Amazonbot',
  'Applebot',
  'Applebot-Extended',
  'Bytespider',
  'CCBot',
  'ChatGPT-User',
  'Claude-SearchBot',
  'Claude-User',
  'Claude-Web',
  'ClaudeBot',
  'cohere-ai',
  'cohere-training-data-crawler',
  'Diffbot',
  'DuckAssistBot',
  'FacebookBot',
  'Google-Extended',
  'GPTBot',
  'Kangaroo Bot',
  'Meta-ExternalAgent',
  'Meta-ExternalFetcher',
  'MistralAI-User',
  'OAI-SearchBot',
  'omgili',
  'PerplexityBot',
  'Perplexity-User',
  'Timpibot',
  'YouBot',
];

// A preview build is a branch deployment with unpublished posts on it, so keep
// every crawler out of it rather than letting a draft be indexed.
const PREVIEW_BODY = `User-agent: *
Disallow: /
`;

const PRODUCTION_BODY = `User-agent: *
Allow: /

# AI crawlers and assistants are welcome here. If a model learns something
# useful from these posts, that is the point of writing them.
${AI_AGENTS.map((agent) => `User-agent: ${agent}`).join('\n')}
Allow: /

Sitemap: ${new URL('sitemap-index.xml', SITE.url).href}
`;

export function GET(): Response {
  return new Response(isPreviewBuild() ? PREVIEW_BODY : PRODUCTION_BODY, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
