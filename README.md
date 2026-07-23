# vicondoa.com

John Vicondoa's personal blog: "All the things I always wanted to write, but
didn't have time to check."

The site is a fully static [Astro](https://astro.build/) project. Posts are
Markdown or MDX, deployments run through Cloudflare Pages, and there is no
server, database, CMS, or runtime adapter.

## Local development

Requirements:

- Node.js 22 (the exact development version is in `.nvmrc`)
- pnpm 11.4.0

Install and start the development server:

```sh
pnpm install
pnpm dev
```

The site will be available at `http://localhost:4321`.

## Commands

| Command             | Purpose                                            |
| ------------------- | -------------------------------------------------- |
| `pnpm dev`          | Start the local authoring server                   |
| `pnpm build`        | Generate the production site in `dist/`            |
| `pnpm preview`      | Serve the generated production site                |
| `pnpm check`        | Validate Astro, TypeScript, and content schemas    |
| `pnpm format`       | Format source files                                |
| `pnpm format:check` | Check formatting without changing files            |
| `pnpm test:e2e`     | Build and run Playwright smoke/accessibility tests |
| `pnpm test`         | Run all repository quality gates                   |

Playwright needs Chromium once on a new development machine:

```sh
pnpm exec playwright install chromium
```

On NixOS, use the packaged Chromium binary instead:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="$(command -v chromium)" pnpm test:e2e
```

## Writing a post

Create a `.md` or `.mdx` file under `src/content/blog/`. The file path becomes
the URL below `/blog/`; for example, `local-history/old-depot.mdx` becomes
`/blog/local-history/old-depot`.

Every post begins with validated frontmatter:

```yaml
---
title: 'A specific title'
description: 'A concise summary used on cards, feeds, and social metadata.'
publishedAt: 2026-07-23
updatedAt: 2026-07-25 # optional
topics:
  - Programming
  - Local history
draft: false
canonical: https://example.com/original-post # optional
---
```

Optional local cover images can be referenced with `cover`. When a cover is
present, `coverAlt` is required. Shared static images can go in
`public/images/`.

Use `draft: true` while working. Drafts appear in the local development server
but are excluded from production pages, topic archives, RSS, and the sitemap.
Run `pnpm check` before publishing; invalid metadata fails the build.

The starter post at `src/content/blog/start-here.mdx` demonstrates prose, code,
images, topics, and an MDX component. Replace it with the first real post.

## Publishing

GitHub Actions runs formatting, Astro/content checks, a production build, and
browser smoke/accessibility tests on pull requests and `main`.

Cloudflare Pages uses direct Git integration:

| Cloudflare setting     | Value                 |
| ---------------------- | --------------------- |
| Production branch      | `main`                |
| Build command          | `pnpm build`          |
| Build output directory | `dist`                |
| Environment variable   | `PNPM_VERSION=11.4.0` |

The Node.js version is read from `.nvmrc`. Astro emits static files, so the
`@astrojs/cloudflare` adapter is intentionally not installed.

Add both `vicondoa.com` and `www.vicondoa.com` as custom domains. The committed
`public/_redirects` file permanently redirects `www` to the apex domain while
preserving the path. `public/_headers` supplies static security headers and
allows Cloudflare's analytics beacon.

Enable Web Analytics from the Pages project's dashboard after the first
deployment. It is cookie-free and requires no repository secret.

## Repository setup

From this directory, after all checks pass:

```sh
git init -b main
git add .
git commit -m "Initial static blog"
gh repo create vicondoa/vicondoa.com --public --source=. --remote=origin --push
```

Creating the repository and authorizing Cloudflare's GitHub integration require
authenticated GitHub and Cloudflare sessions. Never commit access tokens or
Cloudflare account identifiers.

## Licensing

Site software is licensed under the [MIT License](LICENSE). Written posts,
original media, branding, and other editorial content are not covered by the
MIT license and remain all rights reserved; see
[CONTENT-LICENSE.md](CONTENT-LICENSE.md).
