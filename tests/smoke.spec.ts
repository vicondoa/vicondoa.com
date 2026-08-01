import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { getPageCount, getPostsPage } from '../src/lib/pagination';

const githubUrl = 'https://github.com/vicondoa';

test('core routes render and expose discovery files', async ({
  page,
  request,
}) => {
  const routes = [
    '/',
    '/blog/my-thoughts-on-vibe-coding',
    '/topics',
    '/topics/programming',
    '/about',
  ];

  for (const route of routes) {
    const response = await page.goto(route);
    expect(response?.ok(), `${route} should load`).toBe(true);
    await expect(page.locator('main')).toBeVisible();
  }

  const rss = await request.get('/rss.xml');
  expect(rss.ok()).toBe(true);
  expect(await rss.text()).toContain('<rss');

  const sitemap = await request.get('/sitemap-index.xml');
  expect(sitemap.ok()).toBe(true);
  expect(await sitemap.text()).toContain('<sitemapindex');
});

test('site navigation and GitHub profile links are present', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('navigation', { name: 'Primary navigation' }),
  ).toBeVisible();
  await expect(page.locator('h1')).toHaveText("John Vicondoa's blog");
  await expect(page.getByText('Writing', { exact: true })).toHaveCount(0);
  await expect(page.locator(`a[href="${githubUrl}"]`)).toHaveCount(2);
  await expect(page.getByText('John Vicondoa', { exact: true })).toHaveCount(1);
  await expect(
    page.getByText(
      'Tech, AI, and special interests—straight from the underground (basement).',
      { exact: true },
    ),
  ).toHaveCount(1);
  await expect(page.locator('.blog-hero')).toHaveCount(0);

  await page
    .getByRole('link', { name: 'About me', exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.locator(`a[href="${githubUrl}"]`)).toHaveCount(3);
});

test('legacy blog index redirects to the landing page', async ({ page }) => {
  await page.goto('/blog');
  await expect(page).toHaveURL('/');
  await expect(page.locator('h1')).toHaveText("John Vicondoa's blog");
});

test.describe('theme preference', () => {
  test.use({ colorScheme: 'dark' });

  test('follows the system initially and persists an explicit choice', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    const toggle = page.getByRole('button', { name: 'Switch to light theme' });
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await page.goto('/about');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(
      page.getByRole('button', { name: 'Switch to dark theme' }),
    ).toBeVisible();
  });
});

test('custom 404 is served for a missing route', async ({ page }) => {
  const response = await page.goto('/definitely-not-a-page');
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole('heading', { name: 'Nothing on this frequency.' }),
  ).toBeVisible();
});

test('representative pages have no serious accessibility violations', async ({
  page,
}) => {
  for (const route of ['/', '/blog/my-thoughts-on-vibe-coding', '/about']) {
    await page.goto(route);
    const results = await new AxeBuilder({ page }).analyze();
    const seriousViolations = results.violations.filter(
      ({ impact }) => impact === 'critical' || impact === 'serious',
    );

    expect(seriousViolations, `${route} accessibility violations`).toEqual([]);
  }
});

test('pagination keeps ten items on each full page', () => {
  const posts = Array.from({ length: 23 }, (_, index) => index + 1);

  expect(getPageCount(posts.length)).toBe(3);
  expect(getPostsPage(posts, 1)).toEqual(posts.slice(0, 10));
  expect(getPostsPage(posts, 2)).toEqual(posts.slice(10, 20));
  expect(getPostsPage(posts, 3)).toEqual(posts.slice(20));
});
