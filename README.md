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

`make check` is the gate to run before pushing. It runs the Prettier check, the
em dash and en dash lint, the Astro and content type check, a production build,
and validation of the build output.

```sh
make check
```

| Command             | Purpose                                             |
| ------------------- | --------------------------------------------------- |
| `make check`        | Required before pushing: lint, types, build, verify |
| `make lint`         | Prettier check plus the dash lint                   |
| `make test`         | Build and run Playwright smoke/accessibility tests  |
| `make help`         | List every target                                   |
| `pnpm dev`          | Start the local authoring server                    |
| `pnpm build`        | Generate the production site in `dist/`             |
| `pnpm preview`      | Serve the generated production site                 |
| `pnpm check`        | Validate Astro, TypeScript, and content schemas     |
| `pnpm format`       | Format source files                                 |
| `pnpm format:check` | Check formatting without changing files             |
| `pnpm test:e2e`     | Build and run Playwright smoke/accessibility tests  |
| `pnpm test`         | Run all repository quality gates                    |

Writing conventions for this repository, including the ASCII and no-em-dash
rules that `make lint` enforces, are in [AGENTS.md](AGENTS.md).

Playwright needs Chromium once on a new development machine:

```sh
pnpm exec playwright install chromium
```

On NixOS, use the packaged Chromium binary instead:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="$(command -v chromium)" pnpm test:e2e
```

## Previewing a pull request

Cloudflare Pages builds every branch and serves the result from a preview URL,
and that build is the same one production gets. There is no draft mode and
nothing is held back, so a post under review can be read at its real URL before
it merges. Cloudflare posts the branch and commit preview links on the pull
request.

## Writing a post

Create a `.md` or `.mdx` file under `src/content/blog/YYYY/MM/`, where the
directories match the post's `publishedAt` date in UTC. The file name becomes
the last URL segment; for example, `src/content/blog/2026/07/old-depot.md`
published in July 2026 becomes `/blog/2026/07/old-depot`.

The URL is built from `publishedAt` rather than from the file path, so the two
cannot drift apart silently. `make check` fails if a post sits in a directory
that does not match its own publish date.

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
canonical: https://example.com/original-post # optional
---
```

Optional local cover images can be referenced with `cover`. When a cover is
present, `coverAlt` is required. Shared static images can go in
`public/images/`.

Frontmatter is strict, so an unrecognized key fails the build rather than being
ignored. Run `make check` before publishing; invalid metadata fails the build.

## Publishing

GitHub Actions runs formatting, Astro/content checks, a production build, and
browser smoke/accessibility tests on pull requests and `main`. CI jobs are
restricted to runs initiated by the repository owner; outside fork pull requests
cannot execute repository workflows.

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

This is a public source repository but is not open for external contributions.
GitHub does not support disabling fork pull requests on public repositories;
outside pull requests cannot run CI and will not be merged.

## Licensing

Site software is licensed under the [MIT License](LICENSE). Written posts,
original media, branding, and other editorial content are not covered by the MIT
license and remain all rights reserved; see
[CONTENT-LICENSE.md](CONTENT-LICENSE.md).
