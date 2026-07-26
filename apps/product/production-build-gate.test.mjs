import { describe, expect, it } from 'vitest';

import { dayoptStagingUrls, dayoptUrls } from '@dayopt/config';

import {
  assertProductOperationalProductionBuildEnv,
  assertProductStagingBuildEnv,
  FORBIDDEN_PRODUCT_STAGING_BUILD_ENV,
  MCP_PRODUCTION_ORIGIN,
  MCP_STAGING_ORIGIN,
  PRODUCT_PRODUCTION_ORIGIN,
  PRODUCT_STAGING_ORIGIN,
  REQUIRED_PRODUCT_OPERATIONAL_BUILD_ENV,
  REQUIRED_PRODUCT_STAGING_BUILD_ENV,
  resolveProductPublicMcpResourceUri,
} from './production-build-gate.mjs';

function completeProductionEnv() {
  return {
    VERCEL_ENV: 'production',
    RESEND_API_KEY: 'safe-dummy-key',
    RESEND_FROM_EMAIL: 'noreply@dayopt.app',
    RESEND_WEBHOOK_SECRET: 'safe-dummy-webhook-secret',
    UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'safe-dummy-token',
  };
}

function completeStagingEnv() {
  return {
    VERCEL_ENV: 'preview',
    VERCEL_TARGET_ENV: 'staging',
    NEXT_PUBLIC_SUPABASE_URL: 'https://stagingbranchref.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'safe-dummy-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'safe-dummy-service-role-key',
    UPSTASH_REDIS_REST_URL: 'https://staging-example.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'safe-dummy-upstash-token',
    RECOVERY_CODE_PEPPER: 'safe-dummy-recovery-pepper',
    CRON_SECRET: 'safe-dummy-cron-secret',
    GOOGLE_CALENDAR_CLIENT_ID: 'safe-dummy-calendar-client-id',
    GOOGLE_CALENDAR_CLIENT_SECRET: 'safe-dummy-calendar-client-secret',
    CALENDAR_TOKEN_ENCRYPTION_KEY: 'safe-dummy-calendar-encryption-key',
    GOOGLE_CALENDAR_REDIRECT_URIS:
      'https://staging.dayopt.app/api/integrations/google-calendar/callback',
    OAUTH_CLAUDE_REDIRECT_URIS: 'https://claude.ai/api/mcp/auth_callback',
    OAUTH_CHATGPT_REDIRECT_URIS: 'https://chatgpt.com/connector_platform_oauth_redirect',
    OAUTH_CURSOR_REDIRECT_URIS: 'cursor://anysphere.cursor-mcp/oauth/callback',
    MCP_OAUTH_ENVIRONMENT: 'staging',
    OAUTH_AUTHORIZATION_SERVER_URI: 'https://staging.dayopt.app',
    MCP_CANONICAL_RESOURCE_URI: 'https://mcp.staging.dayopt.app',
    NEXT_PUBLIC_APP_URL: 'https://staging.dayopt.app',
  };
}

describe('Product operational production build gate', () => {
  it('uses the shared canonical Product and MCP origins', () => {
    expect({
      productProduction: PRODUCT_PRODUCTION_ORIGIN,
      mcpProduction: MCP_PRODUCTION_ORIGIN,
      productStaging: PRODUCT_STAGING_ORIGIN,
      mcpStaging: MCP_STAGING_ORIGIN,
    }).toEqual({
      productProduction: dayoptUrls.product,
      mcpProduction: dayoptUrls.mcp,
      productStaging: dayoptStagingUrls.product,
      mcpStaging: dayoptStagingUrls.mcp,
    });
  });

  it('skips Preview and non-Vercel CI', () => {
    expect(assertProductOperationalProductionBuildEnv({ VERCEL_ENV: 'preview' })).toBe(false);
    expect(assertProductOperationalProductionBuildEnv({ CI: 'true' })).toBe(false);
  });

  it('does not let CI bypass a Vercel Production contract', () => {
    expect(() =>
      assertProductOperationalProductionBuildEnv({ VERCEL_ENV: 'production', CI: 'true' }),
    ).toThrow(
      `Product production build requires: ${REQUIRED_PRODUCT_OPERATIONAL_BUILD_ENV.join(', ')}`,
    );
  });

  it('rejects staging identity on a Vercel Production deployment', () => {
    expect(() =>
      assertProductOperationalProductionBuildEnv({
        ...completeProductionEnv(),
        MCP_OAUTH_ENVIRONMENT: 'staging',
      }),
    ).toThrow('Product production build cannot use the staging OAuth identity');
  });

  it('lists missing names without printing values', () => {
    expect(() => assertProductOperationalProductionBuildEnv({ VERCEL_ENV: 'production' })).toThrow(
      `Product production build requires: ${REQUIRED_PRODUCT_OPERATIONAL_BUILD_ENV.join(', ')}`,
    );
  });

  it.each(['contact-sender@dayopt.app', ' NoReply@Dayopt.App '])(
    'accepts an apex dayopt.app sender (%s)',
    (sender) => {
      expect(
        assertProductOperationalProductionBuildEnv({
          ...completeProductionEnv(),
          RESEND_FROM_EMAIL: sender,
        }),
      ).toBe(true);
    },
  );

  it.each([
    'onboarding@resend.dev',
    'sender@example.com',
    'sender@notdayopt.app',
    'sender@dayopt.app.example.com',
    'noreply@send.dayopt.app',
    'sender@.dayopt.app',
    'not-an-email',
  ])('rejects an invalid Resend sender (%s)', (sender) => {
    expect(() =>
      assertProductOperationalProductionBuildEnv({
        ...completeProductionEnv(),
        RESEND_FROM_EMAIL: sender,
      }),
    ).toThrow('Product production build requires an apex dayopt.app RESEND_FROM_EMAIL');
  });

  it('rejects a Resend sender with a local part longer than 64 characters', () => {
    const oversizedSender = `${'a'.repeat(65)}@dayopt.app`;
    expect(() =>
      assertProductOperationalProductionBuildEnv({
        ...completeProductionEnv(),
        RESEND_FROM_EMAIL: oversizedSender,
      }),
    ).toThrow('Product production build requires an apex dayopt.app RESEND_FROM_EMAIL');
  });

  it('rejects a malformed Upstash URL before build work starts', () => {
    expect(() =>
      assertProductOperationalProductionBuildEnv({
        ...completeProductionEnv(),
        UPSTASH_REDIS_REST_URL: 'not-a-url',
      }),
    ).toThrow('Product production build requires a valid UPSTASH_REDIS_REST_URL');
  });
});

describe('Product staging build gate', () => {
  it('skips deployments outside the staging Custom Environment', () => {
    expect(assertProductStagingBuildEnv({ VERCEL_ENV: 'preview' })).toBe(false);
  });

  it('accepts an isolated staging identity without delivery, billing, or telemetry config', () => {
    expect(assertProductStagingBuildEnv(completeStagingEnv())).toBe(true);
  });

  it('allows Calendar to remain fully disabled during the initial bootstrap', () => {
    const stagingEnv = completeStagingEnv();
    delete stagingEnv.GOOGLE_CALENDAR_CLIENT_ID;
    delete stagingEnv.GOOGLE_CALENDAR_CLIENT_SECRET;
    delete stagingEnv.CALENDAR_TOKEN_ENCRYPTION_KEY;
    delete stagingEnv.GOOGLE_CALENDAR_REDIRECT_URIS;
    delete stagingEnv.CRON_SECRET;

    expect(assertProductStagingBuildEnv(stagingEnv)).toBe(true);
  });

  it('rejects partial Calendar configuration', () => {
    const stagingEnv = completeStagingEnv();
    delete stagingEnv.GOOGLE_CALENDAR_CLIENT_SECRET;

    expect(() => assertProductStagingBuildEnv(stagingEnv)).toThrow(
      'Product staging Calendar configuration requires:',
    );
  });

  it('requires the complete staging dependency set without printing values', () => {
    expect(() =>
      assertProductStagingBuildEnv({
        VERCEL_ENV: 'preview',
        VERCEL_TARGET_ENV: 'staging',
      }),
    ).toThrow(`Product staging build requires: ${REQUIRED_PRODUCT_STAGING_BUILD_ENV.join(', ')}`);
  });

  it('requires a Vercel Custom Environment instead of a second Production deployment', () => {
    expect(() =>
      assertProductStagingBuildEnv({
        ...completeStagingEnv(),
        VERCEL_ENV: 'production',
      }),
    ).toThrow('Product staging build requires VERCEL_ENV=preview');
  });

  it('rejects the Production Supabase project', () => {
    expect(() =>
      assertProductStagingBuildEnv({
        ...completeStagingEnv(),
        NEXT_PUBLIC_SUPABASE_URL: 'https://yvglwblxrnrenfifsnje.supabase.co',
      }),
    ).toThrow('Product staging build requires a non-Production Supabase branch API origin');
  });

  it.each([
    ['OAUTH_AUTHORIZATION_SERVER_URI', 'https://app.dayopt.app'],
    ['MCP_CANONICAL_RESOURCE_URI', 'https://mcp.dayopt.app'],
    ['NEXT_PUBLIC_APP_URL', 'https://app.dayopt.app'],
    [
      'GOOGLE_CALENDAR_REDIRECT_URIS',
      'https://app.dayopt.app/api/integrations/google-calendar/callback',
    ],
  ])('rejects a Production identity in %s', (name, value) => {
    expect(() =>
      assertProductStagingBuildEnv({
        ...completeStagingEnv(),
        [name]: value,
      }),
    ).toThrow(/canonical staging|exact staging/u);
  });

  it.each(FORBIDDEN_PRODUCT_STAGING_BUILD_ENV)(
    'rejects inherited Production-capable configuration: %s',
    (name) => {
      expect(() =>
        assertProductStagingBuildEnv({
          ...completeStagingEnv(),
          [name]: 'must-not-be-printed',
        }),
      ).toThrow(`Product staging build forbids: ${name}`);
    },
  );

  it('rejects Production billing enforcement without requiring Stripe credentials', () => {
    expect(() =>
      assertProductStagingBuildEnv({
        ...completeStagingEnv(),
        BILLING_ENFORCED: 'true',
      }),
    ).toThrow('Product staging build forbids BILLING_ENFORCED=true');
  });
});

describe('Product public MCP resource', () => {
  it('advertises only the resource owned by Production or staging', () => {
    expect(resolveProductPublicMcpResourceUri(completeProductionEnv())).toBe(MCP_PRODUCTION_ORIGIN);
    expect(resolveProductPublicMcpResourceUri(completeStagingEnv())).toBe(MCP_STAGING_ORIGIN);
  });

  it.each([
    { VERCEL_ENV: 'preview' },
    { VERCEL_ENV: 'preview', VERCEL_TARGET_ENV: 'qa' },
    { VERCEL_ENV: 'development' },
  ])('does not advertise a fixed resource from an inactive Vercel environment', (env) => {
    expect(resolveProductPublicMcpResourceUri(env)).toBe('');
  });

  it('keeps the established Production default for local development', () => {
    expect(resolveProductPublicMcpResourceUri({})).toBe(MCP_PRODUCTION_ORIGIN);
  });
});
