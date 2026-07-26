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

function findExactEntry(
  schema: readonly EnvSchemaEntry[],
  envName: (typeof MCP_APP_ENV_NAMES)[number],
): EnvSchemaEntry {
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
});
