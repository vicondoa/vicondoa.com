/**
 * Cloudflare Pages builds every branch, including pull request branches, and
 * serves the result from a preview URL. Those builds are ordinary production
 * builds, so anything hidden behind `import.meta.env.DEV` never appears there.
 *
 * Treat a build of any branch other than the production one as a preview, so
 * unpublished posts can be reviewed on the deployed site rather than only on
 * a local dev server.
 */
const PRODUCTION_BRANCH = 'main';

export function isPreviewBuild(): boolean {
  const env = typeof process === 'undefined' ? {} : (process.env ?? {});

  if (env.PREVIEW_BUILD === '1') {
    return true;
  }

  if (!env.CF_PAGES) {
    return false;
  }

  return (
    Boolean(env.CF_PAGES_BRANCH) && env.CF_PAGES_BRANCH !== PRODUCTION_BRANCH
  );
}
