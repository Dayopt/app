import { describe, expect, it } from 'vitest';

import { appRouter } from '@/app/api/trpc/_server/app-router';

/**
 * 全 procedure（mutation / query 両方）が write fence（protectedProcedure / proProcedure
 * 経由）を通ることを機械的に保証する。fence check は protectedProcedure の middleware に
 * しか無いため、将来 t.procedure を直接使う procedure が追加されると fence を素通りする —
 * meta.auth の有無でそれを検出する（`auth: 'protected' | 'pro'` は protectedProcedure /
 * proProcedure だけが .meta() で付与する）。
 *
 * このリポジトリに `publicProcedure` は存在しない（`apps/product/src/lib/trpc/procedures.ts`
 * が export するのは protectedProcedure / proProcedure のみ）。つまり mutation・query の
 * どちらも auth meta 無しは常に fence 漏れであり、query だけ緩める理由が無い
 * （元は mutation のみを対象にしていたが、query 41 本がこの網の外にあった。#2187 E-3）。
 *
 * router tree の歩き方は `scripts/generate-api-spec.ts` の `walkRouter` と同じ idiom
 * （`_def.procedure === true` で leaf procedure を判定し、それ以外はネストされた
 * router record として再帰する）。
 */

interface ProcedureDef {
  type: string;
  meta?: { auth?: string };
}

function isProcedure(value: unknown): value is { _def: ProcedureDef } {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return false;
  const def = (value as Record<string, unknown>)._def;
  if (!def || typeof def !== 'object') return false;
  return (def as Record<string, unknown>).procedure === true;
}

function collectProcedures(
  record: Record<string, unknown>,
  parentPath: string[] = [],
): { path: string; type: string; auth: string | undefined }[] {
  const results: { path: string; type: string; auth: string | undefined }[] = [];

  for (const [key, value] of Object.entries(record)) {
    const currentPath = [...parentPath, key];

    if (isProcedure(value)) {
      if (value._def.type === 'mutation' || value._def.type === 'query') {
        results.push({
          path: currentPath.join('.'),
          type: value._def.type,
          auth: value._def.meta?.auth,
        });
      }
    } else if (value !== null && typeof value === 'object') {
      results.push(...collectProcedures(value as Record<string, unknown>, currentPath));
    }
  }

  return results;
}

describe('write fence coverage', () => {
  const procedures = collectProcedures(appRouter._def.record);

  it('全 mutation / query procedure が protectedProcedure 由来（auth meta 付き）である', () => {
    const withoutAuthMeta = procedures.filter(
      (procedure) => !['protected', 'pro'].includes(procedure.auth ?? ''),
    );

    expect(withoutAuthMeta.map((procedure) => `${procedure.type}:${procedure.path}`)).toEqual([]);
  });

  it('mutation procedure が 1 件以上存在する（このテストが空振りで通っていないことの確認）', () => {
    expect(procedures.filter((procedure) => procedure.type === 'mutation').length).toBeGreaterThan(
      0,
    );
  });

  it('query procedure が 1 件以上存在する（このテストが空振りで通っていないことの確認）', () => {
    expect(procedures.filter((procedure) => procedure.type === 'query').length).toBeGreaterThan(0);
  });
});
