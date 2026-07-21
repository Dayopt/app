import { dayoptProductUrls } from '@dayopt/config';
import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';

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
    await page.addStyleTag({
      content:
        '.hero-animate { opacity: 1 !important; animation: none !important; filter: none !important; transform: none !important; }',
    });
    await testInfo.attach(`lp-${pattern.name}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  }
});

const LEGAL_PAGE_CASES = [
  {
    locale: 'en',
    slug: 'privacy',
    path: '/legal/privacy',
    hash: '94ed53e3dba740f455ad16bc595ae4984933d50b05c2ecc56fe1105be22c8ce5',
    title: 'Privacy Policy - Dayopt',
    description: 'How Dayopt handles your personal information',
    hrefs: ['/legal/cookies'],
    counts: { h1: 1, h2: 19, h3: 0, tables: 0, lists: 15 },
  },
  {
    locale: 'en',
    slug: 'terms',
    path: '/legal/terms',
    hash: 'b6e5428af86a1c023dda832dacb5411fa140bf4ec7d3f537511c773bcd499fa9',
    title: 'Terms of Service - Dayopt',
    description: 'Our terms and conditions for using the Dayopt service',
    hrefs: ['/legal/refund'],
    counts: { h1: 1, h2: 20, h3: 0, tables: 0, lists: 15 },
  },
  {
    locale: 'en',
    slug: 'cookies',
    path: '/legal/cookies',
    hash: 'fce1566d1c449ebefdb667224ba2767af09d3ecb3e044027c1d430c11a875d34',
    title: 'Cookie Policy - Dayopt',
    description: 'How Dayopt uses cookies and similar technologies',
    hrefs: ['/legal/privacy'],
    counts: { h1: 1, h2: 10, h3: 4, tables: 1, lists: 2 },
  },
  {
    locale: 'en',
    slug: 'tokushoho',
    path: '/legal/tokushoho',
    hash: '43a4c3512db7b5fa73330f17e81ec74bb68dd942f184a91535c1f3520a154f6a',
    title: 'Specified Commercial Transactions Act - Dayopt',
    description: 'Information required under the Act on Specified Commercial Transactions (Japan)',
    hrefs: [],
    counts: { h1: 1, h2: 0, h3: 0, tables: 1, lists: 4 },
  },
  {
    locale: 'en',
    slug: 'security',
    path: '/legal/security',
    hash: '05862f571f5475c194efaf9acb1024c2c5e2053433f1afe05294932ef93e39a1',
    title: 'Security - Dayopt',
    description: 'Dayopt implements the highest standards of security to protect your information.',
    hrefs: [
      'mailto:security@dayopt.app',
      'https://github.com/Dayopt/dayopt/security/advisories/new',
      'https://github.com/Dayopt/dayopt/blob/main/docs/legal/SECURITY.md',
      'https://github.com/Dayopt/dayopt/blob/main/docs/legal/VULNERABILITY_DISCLOSURE.md',
      'https://github.com/Dayopt/dayopt/blob/main/docs/legal/INCIDENT_RESPONSE.md',
      '/legal/privacy',
      'mailto:security@dayopt.app',
      'mailto:support@dayopt.app',
    ],
    counts: { h1: 1, h2: 5, h3: 10, tables: 2, lists: 5 },
  },
  {
    locale: 'ja',
    slug: 'privacy',
    path: '/ja/legal/privacy',
    hash: 'ded3505633f9ef952104be4b2955d9e21e1cf227d6f89594e833ace4fd5651d4',
    title: 'プライバシーポリシー - Dayopt',
    description: 'Dayoptにおける個人情報の取り扱いについて',
    hrefs: ['/ja/legal/cookies'],
    counts: { h1: 1, h2: 19, h3: 0, tables: 0, lists: 15 },
  },
  {
    locale: 'ja',
    slug: 'terms',
    path: '/ja/legal/terms',
    hash: 'ae0e84b2d10f44c6623095d870efe8c761473828f73b5ff3ca5320056f47e91c',
    title: '利用規約 - Dayopt',
    description: 'Dayoptサービスの利用に関する規約',
    hrefs: ['/ja/legal/refund'],
    counts: { h1: 1, h2: 20, h3: 0, tables: 0, lists: 15 },
  },
  {
    locale: 'ja',
    slug: 'cookies',
    path: '/ja/legal/cookies',
    hash: '9f790dafd02d78ada319a73b3d503d4a2e2e868af312af6171fc263212c84ec2',
    title: 'Cookieポリシー - Dayopt',
    description: 'Dayoptにおけるクッキーおよび類似技術の使用について',
    hrefs: ['/ja/legal/privacy'],
    counts: { h1: 1, h2: 10, h3: 4, tables: 1, lists: 2 },
  },
  {
    locale: 'ja',
    slug: 'tokushoho',
    path: '/ja/legal/tokushoho',
    hash: 'fa4a8a30b38c18df658073e11b8f360df4ac6e34474a07eb0e1f39b7888609f3',
    title: '特定商取引法に基づく表記 - Dayopt',
    description: '特定商取引法に基づく通信販売業者の表示義務に関する情報',
    hrefs: [],
    counts: { h1: 1, h2: 0, h3: 0, tables: 1, lists: 4 },
  },
  {
    locale: 'ja',
    slug: 'security',
    path: '/ja/legal/security',
    hash: 'be45cbfb8ad02f5b27b622701ce945fc8237538cfb1f384b95f3fd7689a6c70a',
    title: 'セキュリティ - Dayopt',
    description:
      'Dayoptは、ユーザーの皆様の情報を保護するために、最高水準のセキュリティ対策を実施しています。',
    hrefs: [
      'mailto:security@dayopt.app',
      'https://github.com/Dayopt/dayopt/security/advisories/new',
      'https://github.com/Dayopt/dayopt/blob/main/docs/legal/SECURITY.md',
      'https://github.com/Dayopt/dayopt/blob/main/docs/legal/VULNERABILITY_DISCLOSURE.md',
      'https://github.com/Dayopt/dayopt/blob/main/docs/legal/INCIDENT_RESPONSE.md',
      '/legal/privacy',
      'mailto:security@dayopt.app',
      'mailto:support@dayopt.app',
    ],
    counts: { h1: 1, h2: 5, h3: 10, tables: 2, lists: 5 },
  },
] as const;

test.describe('legal pages', () => {
  for (const legalPage of LEGAL_PAGE_CASES) {
    test(`${legalPage.locale}/${legalPage.slug} の本文と metadata を維持する`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(legalPage.path);

      const main = page.locator('#main-content');
      const innerText = await main.evaluate((element) => {
        const warning = element.querySelector<HTMLElement>('[data-legal-review-warning]');
        if (!warning) return (element as HTMLElement).innerText;

        const wasHidden = warning.hidden;
        warning.hidden = true;
        const contractText = (element as HTMLElement).innerText;
        warning.hidden = wasHidden;
        return contractText;
      });
      expect(createHash('sha256').update(innerText).digest('hex')).toBe(legalPage.hash);
      await expect(page).toHaveTitle(legalPage.title);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute(
        'content',
        legalPage.description,
      );
      expect(
        await main
          .locator('a')
          .evaluateAll((links) => links.map((link) => link.getAttribute('href'))),
      ).toEqual(legalPage.hrefs);
      expect({
        h1: await main.locator('h1').count(),
        h2: await main.locator('h2').count(),
        h3: await main.locator('h3').count(),
        tables: await main.locator('table').count(),
        lists: await main
          .locator('ul, ol')
          .evaluateAll(
            (lists) =>
              lists.filter((list) => list.closest('[data-legal-review-warning]') === null).length,
          ),
      }).toEqual(legalPage.counts);

      await testInfo.attach(`legal-${legalPage.locale}-${legalPage.slug}-desktop`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      });

      if (['cookies', 'tokushoho', 'security'].includes(legalPage.slug)) {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(legalPage.path);
        await expect(page.locator('#main-content')).toBeVisible();
        await testInfo.attach(`legal-${legalPage.locale}-${legalPage.slug}-mobile`, {
          body: await page.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
      }
    });
  }
});
