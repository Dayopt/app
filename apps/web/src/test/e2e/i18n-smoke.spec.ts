import { dayoptProductUrls } from '@dayopt/config';
import { expect, test } from '@playwright/test';

test('footer の言語切替で locale prefix と hero copy が切り替わる', async ({ page }) => {
  await page.goto('/');

  const hero = page.getByRole('heading', { level: 1 });
  await expect(hero).toContainText('Plan days you can actually keep.');

  await page.getByRole('button', { name: 'English - Change language' }).click();
  await page.getByRole('menuitemcheckbox', { name: '日本語' }).click();

  await expect(page).toHaveURL(/\/ja\/?$/);
  await expect(hero).toContainText('守れる計画を、立てられるように。');

  await page.getByRole('button', { name: '日本語 - Change language' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'English' }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page).not.toHaveURL(/\/ja\/?$/);
  await expect(hero).toContainText('Plan days you can actually keep.');
});

test('登録 CTA が product signup に統一されている', async ({ page }) => {
  expect(dayoptProductUrls.signup).toBe('https://app.dayopt.app/auth/signup');

  await page.goto('/');

  const signupHrefs = await page
    .locator('a')
    .evaluateAll((links) =>
      links
        .map((link) => link.getAttribute('href'))
        .filter((href): href is string => href?.endsWith('/signup') ?? false),
    );

  expect(signupHrefs.length).toBeGreaterThan(0);
  expect(signupHrefs.every((href) => href === dayoptProductUrls.signup)).toBe(true);
});

test('LP metadata と OG image が新コピーに整合する', async ({ page }) => {
  const title = 'Plan days you can actually keep.';
  const description =
    'Your plan and what actually happened, in one timeline. See where they drift — and get better at planning. The lightest timeboxing tool for knowledge workers.';

  await page.goto('/');

  await expect(page).toHaveTitle(`${title} | Dayopt`);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', description);

  const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content');
  expect(ogImage).not.toBeNull();

  const ogUrl = new URL(ogImage as string);
  expect(ogUrl.pathname).toBe('/api/og');
  expect(ogUrl.searchParams.get('title')).toBe(title);
  expect(ogUrl.searchParams.get('description')).toBe(description);

  const response = await page.request.get(`/api/og?${ogUrl.searchParams.toString()}`);
  expect(response.ok()).toBe(true);
  expect(response.headers()['content-type']).toContain('image/png');
});

test('LP の en/ja × desktop/mobile を表示できる', async ({ page }, testInfo) => {
  const patterns = [
    {
      name: 'en-desktop',
      path: '/',
      headline: 'Plan days you can actually keep.',
      width: 1440,
      height: 1000,
    },
    {
      name: 'ja-desktop',
      path: '/ja',
      headline: '守れる計画を、立てられるように。',
      width: 1440,
      height: 1000,
    },
    {
      name: 'en-mobile',
      path: '/',
      headline: 'Plan days you can actually keep.',
      width: 390,
      height: 844,
    },
    {
      name: 'ja-mobile',
      path: '/ja',
      headline: '守れる計画を、立てられるように。',
      width: 390,
      height: 844,
    },
  ] as const;

  for (const pattern of patterns) {
    await page.context().clearCookies();
    await page.setViewportSize({ width: pattern.width, height: pattern.height });
    await page.goto(pattern.path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(pattern.headline);
    await expect(page.locator('#pricing')).toBeVisible();
    // hero のスタガードフェードを打ち消す addStyleTag は不要になった
    // （2026-07-30 に hero のアニメーションを廃止したため）
    await testInfo.attach(`lp-${pattern.name}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  }
});
