import { describe, expect, it } from 'vitest';

import {
  assertProductOperationalProductionBuildEnv,
  REQUIRED_PRODUCT_OPERATIONAL_BUILD_ENV,
} from './production-build-gate.mjs';

function completeProductionEnv() {
  return {
    VERCEL_ENV: 'production',
    GITHUB_TOKEN: 'configured',
    GITHUB_CONTACT_REPO: 'Dayopt/contact-private',
    UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'configured',
  };
}

describe('Product operational production build gate', () => {
  it('does not require Production-only credentials in Preview or CI', () => {
    expect(assertProductOperationalProductionBuildEnv({ VERCEL_ENV: 'preview' })).toBe(false);
    expect(assertProductOperationalProductionBuildEnv({ CI: 'true' })).toBe(false);
  });

  it('lists missing credentials without printing values', () => {
    expect(() => assertProductOperationalProductionBuildEnv({ VERCEL_ENV: 'production' })).toThrow(
      `Product production build requires: ${REQUIRED_PRODUCT_OPERATIONAL_BUILD_ENV.join(', ')}`,
    );
  });

  it('accepts complete Production operational credentials', () => {
    expect(assertProductOperationalProductionBuildEnv(completeProductionEnv())).toBe(true);
  });

  it('rejects a malformed Upstash URL before build work starts', () => {
    expect(() =>
      assertProductOperationalProductionBuildEnv({
        ...completeProductionEnv(),
        UPSTASH_REDIS_REST_URL: 'not-a-url',
      }),
    ).toThrow('Product production build requires a valid UPSTASH_REDIS_REST_URL');
  });

  it('refuses the known public contact repository before build work starts', () => {
    expect(() =>
      assertProductOperationalProductionBuildEnv({
        ...completeProductionEnv(),
        GITHUB_CONTACT_REPO: 'Dayopt/dayopt',
      }),
    ).toThrow('Product production build refuses the public Dayopt/dayopt contact repository');
  });
});
