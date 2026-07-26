import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { dayoptDomains, dayoptStagingDomains } from '../../packages/config/src/constants';

type HostCondition = {
  type: 'host';
  value: {
    eq: string;
  };
};

type Rewrite = {
  source: string;
  destination: string;
  has: HostCondition[];
};

type VercelConfig = {
  rewrites: Rewrite[];
};

const configPath = fileURLToPath(new URL('../../vercel.json', import.meta.url));
const config = JSON.parse(readFileSync(configPath, 'utf8')) as VercelConfig;

const EXPECTED_REWRITES = [
  ['/', '/api/mcp', dayoptDomains.mcp],
  ['/', '/api/mcp', dayoptStagingDomains.mcp],
  ['/mcp', '/api/mcp', dayoptDomains.mcp],
  ['/mcp', '/api/mcp', dayoptStagingDomains.mcp],
  ['/oauth/token', '/api/oauth/token', dayoptDomains.product],
  ['/oauth/token', '/api/oauth/token', dayoptStagingDomains.product],
] as const;

describe('MCP Vercel routing contract', () => {
  it('uses only exact fixed-host rewrites for Product and MCP aliases', () => {
    expect(
      config.rewrites.map((rewrite) => [
        rewrite.source,
        rewrite.destination,
        rewrite.has[0]?.value.eq,
      ]),
    ).toEqual(EXPECTED_REWRITES);

    expect(JSON.stringify(config.rewrites)).not.toMatch(/\*|vercel\.app/u);
  });

  it('serves reserved .well-known paths from filesystem routes instead of rewrites', () => {
    expect(config.rewrites.some((rewrite) => rewrite.source.startsWith('/.well-known'))).toBe(
      false,
    );

    for (const path of [
      '../../apps/product/src/app/.well-known/oauth-authorization-server/route.ts',
      '../../apps/product/src/app/.well-known/oauth-protected-resource/route.ts',
    ]) {
      expect(existsSync(fileURLToPath(new URL(path, import.meta.url)))).toBe(true);
    }

    for (const path of [
      '../../apps/product/src/app/api/well-known/oauth-authorization-server/route.ts',
      '../../apps/product/src/app/api/well-known/oauth-protected-resource/route.ts',
    ]) {
      expect(existsSync(fileURLToPath(new URL(path, import.meta.url)))).toBe(false);
    }
  });
});
