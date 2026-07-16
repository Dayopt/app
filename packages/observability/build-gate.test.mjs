import { describe, expect, it } from 'vitest';

import {
  assertProductionSentryBuildEnv,
  failSentryBuild,
  REQUIRED_SENTRY_BUILD_ENV,
} from './build-gate.mjs';

describe('Sentry production build gate', () => {
  it('does not require Sentry credentials outside Vercel Production', () => {
    expect(assertProductionSentryBuildEnv({ VERCEL_ENV: 'preview' }, 'Web')).toBe(false);
    expect(assertProductionSentryBuildEnv({ CI: 'true' }, 'Product')).toBe(false);
  });

  it('lists missing production credentials without printing values', () => {
    expect(() => assertProductionSentryBuildEnv({ VERCEL_ENV: 'production' }, 'Product')).toThrow(
      `Product Sentry production build requires: ${REQUIRED_SENTRY_BUILD_ENV.join(', ')}`,
    );
  });

  it('enables release upload only when every production value exists', () => {
    const env = Object.fromEntries(REQUIRED_SENTRY_BUILD_ENV.map((name) => [name, 'configured']));
    env.VERCEL_ENV = 'production';
    env.NEXT_PUBLIC_SENTRY_DSN = 'https://public@example.ingest.sentry.io/1';
    env.SENTRY_DSN = 'https://public@example.ingest.sentry.io/1';

    expect(assertProductionSentryBuildEnv(env, 'Web')).toBe(true);
  });

  it('rejects a malformed Production DSN before the build starts', () => {
    const env = Object.fromEntries(REQUIRED_SENTRY_BUILD_ENV.map((name) => [name, 'configured']));
    env.VERCEL_ENV = 'production';
    env.NEXT_PUBLIC_SENTRY_DSN = 'not-a-dsn';
    env.SENTRY_DSN = 'https://public@example.ingest.sentry.io/1';

    expect(() => assertProductionSentryBuildEnv(env, 'Product')).toThrow(
      'Product Sentry production build requires a valid NEXT_PUBLIC_SENTRY_DSN',
    );
  });

  it('fails the build when release creation or source-map upload fails', () => {
    const uploadError = new Error('source map upload failed');

    expect(() => failSentryBuild(uploadError)).toThrow(uploadError);
  });
});
