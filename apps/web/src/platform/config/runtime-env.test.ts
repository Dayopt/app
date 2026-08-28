import { dayoptUrls } from '@dayopt/config';
import { afterEach, describe, expect, it, vi } from 'vitest';

const ENV_KEYS = [
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_SITE_URL',
  'VERCEL_URL',
  'VERCEL_ENV',
  'RESEND_API_KEY',
  'RESEND_FROM_EMAIL',
  'RESEND_WEBHOOK_SECRET',
  'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
  'TURNSTILE_SECRET_KEY',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
] as const;

async function loadRuntimeEnv(values: Record<string, string>) {
  vi.resetModules();
  for (const key of ENV_KEYS) {
    vi.stubEnv(key, '');
  }
  for (const [key, value] of Object.entries(values)) {
    vi.stubEnv(key, value);
  }
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  return import('./env');
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('runtime env URL helpers', () => {
  it('APP_URL、VERCEL_URL、development、marketing URL の順で fallback する', async () => {
    const appUrl = await loadRuntimeEnv({
      NODE_ENV: 'production',
      NEXT_PUBLIC_APP_URL: 'https://app.example.com',
      VERCEL_URL: 'preview.vercel.app',
    });
    expect(appUrl.getAppUrl()).toBe('https://app.example.com');

    const vercelUrl = await loadRuntimeEnv({
      NODE_ENV: 'production',
      VERCEL_URL: 'preview.vercel.app',
    });
    expect(vercelUrl.getAppUrl()).toBe('https://preview.vercel.app');

    const development = await loadRuntimeEnv({ NODE_ENV: 'development' });
    expect(development.getAppUrl()).toBe('http://localhost:3000');

    const production = await loadRuntimeEnv({ NODE_ENV: 'production' });
    expect(production.getAppUrl()).toBe(dayoptUrls.marketing);
  });

  it('Vercel Production ではデプロイ固有の VERCEL_URL を使わず正規ドメインを返す', async () => {
    // VERCEL_URL はデプロイのたびに変わるため、canonical / sitemap / robots が
    // デプロイ固有ホストになる事故を防ぐ（2026-07-27 に本番で発生）
    const production = await loadRuntimeEnv({
      NODE_ENV: 'production',
      VERCEL_ENV: 'production',
      VERCEL_URL: 'web-k94imlgmq-dayopt.vercel.app',
    });
    expect(production.getAppUrl()).toBe(dayoptUrls.marketing);
    expect(production.getSiteUrl()).toBe(dayoptUrls.marketing);

    // Preview は自己参照させたいので VERCEL_URL を使う
    const preview = await loadRuntimeEnv({
      NODE_ENV: 'production',
      VERCEL_ENV: 'preview',
      VERCEL_URL: 'web-abc123-dayopt.vercel.app',
    });
    expect(preview.getAppUrl()).toBe('https://web-abc123-dayopt.vercel.app');

    // 明示指定は Production でも最優先
    const explicit = await loadRuntimeEnv({
      NODE_ENV: 'production',
      VERCEL_ENV: 'production',
      VERCEL_URL: 'web-k94imlgmq-dayopt.vercel.app',
      NEXT_PUBLIC_APP_URL: 'https://app.example.com',
    });
    expect(explicit.getAppUrl()).toBe('https://app.example.com');
  });

  it('SITE_URL は app URL より優先する', async () => {
    const runtime = await loadRuntimeEnv({
      NODE_ENV: 'production',
      NEXT_PUBLIC_APP_URL: 'https://app.example.com',
      NEXT_PUBLIC_SITE_URL: 'https://site.example.com',
    });
    expect(runtime.getSiteUrl()).toBe('https://site.example.com');
  });

  it('module load 時の env snapshot を維持する', async () => {
    const runtime = await loadRuntimeEnv({
      NODE_ENV: 'production',
      NEXT_PUBLIC_APP_URL: 'https://first.example.com',
    });
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://second.example.com');

    expect(runtime.getAppUrl()).toBe('https://first.example.com');
    expect(runtime.env.NEXT_PUBLIC_APP_URL).toBe('https://first.example.com');
  });
});
