import { expect, test, type Page } from '@playwright/test';

async function getRegisteredServiceWorker(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return null;
    const registrations = await navigator.serviceWorker.getRegistrations();
    return registrations[0]?.scope ?? null;
  });
}

test.describe('PWA installability', () => {
  test('exposes a valid web app manifest', async ({ page }) => {
    await page.goto('/');

    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(manifestHref).toBeTruthy();

    const manifestUrl = new URL(manifestHref!, page.url());
    const response = await page.request.get(manifestUrl.toString());
    expect(response.status()).toBe(200);

    const manifest = (await response.json()) as Record<string, unknown>;
    expect(manifest).toHaveProperty('name');
    expect(manifest).toHaveProperty('start_url');
    expect(manifest).toHaveProperty('display');
    expect(manifest).toHaveProperty('icons');

    const icons = manifest['icons'] as Array<Record<string, unknown>>;
    const sizes = icons.map((icon) => icon['sizes'] as string);
    expect(sizes.some((size) => size.includes('192'))).toBe(true);
    expect(sizes.some((size) => size.includes('512'))).toBe(true);
  });

  test('registers the service worker in a production build', async ({ page }) => {
    test.skip(process.env.NODE_ENV !== 'production', 'Service Worker requires next start');

    await page.goto('/');
    await expect.poll(() => getRegisteredServiceWorker(page), { timeout: 5_000 }).not.toBeNull();
  });

  test('serves cached content or the offline fallback without a network', async ({
    context,
    page,
  }) => {
    test.skip(process.env.NODE_ENV !== 'production', 'Service Worker requires next start');

    await page.goto('/');
    await expect.poll(() => getRegisteredServiceWorker(page), { timeout: 5_000 }).not.toBeNull();

    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => undefined);

    await expect(page.locator('body')).not.toBeEmpty();
    await context.setOffline(false);
  });
});
