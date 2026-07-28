import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { envSchema, productionEnvSchema, type EnvSchemaEntry } from '../env/schema';

const MCP_APP_ENV_NAMES = [
  'OAUTH_CLAUDE_REDIRECT_URIS',
  'OAUTH_CHATGPT_REDIRECT_URIS',
  'OAUTH_CURSOR_REDIRECT_URIS',
  'MCP_OAUTH_ENVIRONMENT',
  'OAUTH_AUTHORIZATION_SERVER_URI',
  'MCP_CANONICAL_RESOURCE_URI',
  'MCP_WRITE_ENABLED_CLIENTS',
] as const;

const REQUIRED_STAGING_IDENTITY_NAMES = new Set([
  'MCP_OAUTH_ENVIRONMENT',
  'OAUTH_AUTHORIZATION_SERVER_URI',
  'MCP_CANONICAL_RESOURCE_URI',
]);

const STRIPE_IDENTITY_ENV_NAMES = ['STRIPE_ACCOUNT_ID', 'STRIPE_LIVEMODE'] as const;

const opEnvExample = readFileSync(
  fileURLToPath(new URL('../../.op-env.local.example', import.meta.url)),
  'utf8',
);

const productEnvExample = readFileSync(
  fileURLToPath(new URL('../../apps/product/.env.example', import.meta.url)),
  'utf8',
);

const setup1PasswordScript = readFileSync(
  fileURLToPath(new URL('../setup-1password.sh', import.meta.url)),
  'utf8',
);

const secretsDocumentation = readFileSync(
  fileURLToPath(new URL('../../docs/operations/secrets.md', import.meta.url)),
  'utf8',
);

function findExactEntry(schema: readonly EnvSchemaEntry[], envName: string): EnvSchemaEntry {
  const matches = schema.filter((entry) => entry.envName === envName);
  expect(matches).toHaveLength(1);
  return matches[0]!;
}

describe('MCP OAuth env inventory', () => {
  it.each([
    {
      environment: 'staging' as const,
      schema: envSchema,
      vault: 'Dayopt-Staging',
    },
    {
      environment: 'production' as const,
      schema: productionEnvSchema,
      vault: 'Dayopt-Production',
    },
  ])(
    '$environmentのapp itemにclient redirect、OAuth identity、MCP gateをexactly once登録する',
    ({ environment, schema, vault }) => {
      for (const envName of MCP_APP_ENV_NAMES) {
        expect(findExactEntry(schema, envName)).toEqual({
          envName,
          required: environment === 'staging' && REQUIRED_STAGING_IDENTITY_NAMES.has(envName),
          visibility: 'public',
          environment,
          vault,
          item: 'app',
          field: envName,
        });
      }
    },
  );

  it('local 1Password referenceにMCP app変数をexactly once置く', () => {
    for (const envName of MCP_APP_ENV_NAMES) {
      const matches = opEnvExample.match(
        new RegExp(`^${envName}=op://Dayopt-Staging/app/${envName}$`, 'gmu'),
      );
      expect(matches, envName).toHaveLength(1);
    }
  });

  it('Product env exampleにMCPとStripe identityの空変数をexactly once置く', () => {
    for (const envName of [...MCP_APP_ENV_NAMES, ...STRIPE_IDENTITY_ENV_NAMES]) {
      const matches = productEnvExample.match(new RegExp(`^${envName}=$`, 'gmu'));
      expect(matches, envName).toHaveLength(1);
    }
  });

  it.each([
    {
      environment: 'staging' as const,
      schema: envSchema,
      vault: 'Dayopt-Staging',
      item: 'stripe-test',
    },
    {
      environment: 'production' as const,
      schema: productionEnvSchema,
      vault: 'Dayopt-Production',
      item: 'stripe-live',
    },
  ])(
    '$environmentのStripe provider identityを同じitemへexactly once登録する',
    ({ environment, schema, vault, item }) => {
      for (const envName of STRIPE_IDENTITY_ENV_NAMES) {
        expect(findExactEntry(schema, envName)).toEqual({
          envName,
          required: false,
          visibility: 'public',
          environment,
          vault,
          item,
          field: envName,
        });
      }
    },
  );

  it('1Password setupとSecrets文書にStripe provider identityを登録する', () => {
    const stripeTestRow = secretsDocumentation
      .split('\n')
      .find((line) => line.startsWith('| `stripe-test`'));
    const stripeLiveRow = secretsDocumentation
      .split('\n')
      .find((line) => line.startsWith('| `stripe-live`'));

    expect(stripeTestRow).toBeDefined();
    expect(stripeLiveRow).toBeDefined();

    for (const envName of STRIPE_IDENTITY_ENV_NAMES) {
      const setupMatches = setup1PasswordScript.match(new RegExp(`'${envName}\\[text\\]='`, 'gu'));
      expect(setupMatches, envName).toHaveLength(2);
      expect(stripeTestRow).toContain(envName);
      expect(stripeLiveRow).toContain(envName);
    }
  });

  it('local 1Password referenceにStripe provider identityをexactly once置く', () => {
    for (const envName of STRIPE_IDENTITY_ENV_NAMES) {
      const matches = opEnvExample.match(
        new RegExp(`^${envName}=op://Dayopt-Staging/stripe-test/${envName}$`, 'gmu'),
      );
      expect(matches, envName).toHaveLength(1);
    }
  });
});
