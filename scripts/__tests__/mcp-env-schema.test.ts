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

const MCP_PREVIEW_ENV_NAMES = [
  'MCP_OAUTH_PREVIEW_BRANCH',
  'MCP_OAUTH_PREVIEW_UPSTASH_HOST',
] as const;

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
      pendingReason: undefined,
    },
    {
      environment: 'production' as const,
      schema: productionEnvSchema,
      vault: 'Dayopt-Production',
      // production の MCP app 変数は #1754（MCP OAuth epic、status:watching）の
      // 未展開分として pendingReason を持つ（#2063）。staging は local dev
      // 直接消費のため schema先行ではなく pendingReason を付けない。
      pendingReason: '#1754（MCP OAuth epic、status:watching）の production 未展開分',
    },
  ])(
    '$environmentのapp itemにclient redirect、OAuth identity、MCP gateをexactly once登録する',
    ({ environment, schema, vault, pendingReason }) => {
      for (const envName of MCP_APP_ENV_NAMES) {
        expect(findExactEntry(schema, envName)).toEqual({
          envName,
          // dark release では 1Password field 未作成の開発者の `pnpm env:check` を
          // 落とさないため、MCP 変数はすべて optional に保つ。
          required: false,
          visibility: 'public',
          environment,
          vault,
          item: 'app',
          field: envName,
          ...(pendingReason ? { pendingReason } : {}),
        });
      }
    },
  );

  it('local 1Password referenceにMCP app変数をexactly once置く', () => {
    for (const envName of [...MCP_APP_ENV_NAMES, ...MCP_PREVIEW_ENV_NAMES]) {
      const matches = opEnvExample.match(
        new RegExp(`^${envName}=op://Dayopt-Staging/app/${envName}$`, 'gmu'),
      );
      expect(matches, envName).toHaveLength(1);
    }
  });

  it('Product env exampleにMCPの空変数をexactly once置く', () => {
    for (const envName of [...MCP_APP_ENV_NAMES, ...MCP_PREVIEW_ENV_NAMES]) {
      const matches = productEnvExample.match(new RegExp(`^${envName}=$`, 'gmu'));
      expect(matches, envName).toHaveLength(1);
    }
  });

  it('Preview専用変数をStagingのapp itemだけに登録する', () => {
    for (const envName of MCP_PREVIEW_ENV_NAMES) {
      expect(findExactEntry(envSchema, envName)).toEqual({
        envName,
        required: false,
        visibility: 'public',
        environment: 'staging',
        vault: 'Dayopt-Staging',
        item: 'app',
        field: envName,
      });
      expect(productionEnvSchema.some((entry) => entry.envName === envName)).toBe(false);
      expect(setup1PasswordScript.match(new RegExp(`'${envName}\\[text\\]='`, 'gu'))).toHaveLength(
        1,
      );
    }
  });

  it('1Password setupとSecrets文書のapp itemにMCP変数を載せる', () => {
    const appRows = secretsDocumentation.split('\n').filter((line) => line.startsWith('| `app`'));
    expect(appRows).toHaveLength(2);

    for (const envName of MCP_APP_ENV_NAMES) {
      const setupMatches = setup1PasswordScript.match(new RegExp(`'${envName}\\[text\\]='`, 'gu'));
      expect(setupMatches, envName).toHaveLength(2);
      for (const row of appRows) expect(row).toContain(envName);
    }
  });

  it('常設Stagingを前提にしないことをSecrets文書で宣言する', () => {
    expect(secretsDocumentation).toContain('常設Stagingは作らない');
  });
});
