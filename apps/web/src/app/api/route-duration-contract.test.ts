import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { globSync } from 'glob';
import { describe, expect, it } from 'vitest';

const ROUTE_DURATION_CONTRACT = {
  'src/app/api/compass-docs/route.ts': 30,
  'src/app/api/contact/route.ts': 30,
  'src/app/api/csp-report/route.ts': 30,
  'src/app/api/og/route.tsx': 25,
  'src/app/api/search/route.ts': 30,
  'src/app/api/v1/system/[...retired]/route.ts': 5,
  'src/app/api/webhooks/resend/route.ts': 15,
} as const;

describe('Web API route duration contract', () => {
  it('全 route が静的な maxDuration を明示する', () => {
    const discoveredRoutes = globSync('src/app/api/**/route.{ts,tsx}', {
      cwd: process.cwd(),
    }).sort();

    expect(discoveredRoutes).toEqual(Object.keys(ROUTE_DURATION_CONTRACT).sort());

    for (const [routePath, maxDuration] of Object.entries(ROUTE_DURATION_CONTRACT)) {
      const source = readFileSync(resolve(process.cwd(), routePath), 'utf8');
      expect(source).toMatch(
        new RegExp(`export\\s+const\\s+maxDuration\\s*=\\s*${maxDuration}\\s*;`),
      );
    }
  });

  it('vercel.json は route config と競合する functions override を持たない', () => {
    const config = JSON.parse(
      readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'),
    ) as Record<string, unknown>;

    expect(config).not.toHaveProperty('functions');
  });
});
