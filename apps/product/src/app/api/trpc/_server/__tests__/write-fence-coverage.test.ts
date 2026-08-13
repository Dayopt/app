import { describe, expect, it } from 'vitest';

import { appRouter } from '@/app/api/trpc/_server/app-router';

/**
 * 全 mutation procedure が write fence（protectedProcedure / proProcedure 経由）を
 * 通ることを機械的に保証する。fence check は protectedProcedure の middleware にしか
 * 無いため、将来 t.procedure を直接使う mutation が追加されると fence を素通りする —
 * meta.auth の有無でそれを検出する（`auth: 'protected' | 'pro'` は protectedProcedure /
 * proProcedure だけが .meta() で付与する）。
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

function collectMutations(
  record: Record<string, unknown>,
  parentPath: string[] = [],
): { path: string; auth: string | undefined }[] {
  const results: { path: string; auth: string | undefined }[] = [];

  for (const [key, value] of Object.entries(record)) {
    const currentPath = [...parentPath, key];

    if (isProcedure(value)) {
      if (value._def.type === 'mutation') {
        results.push({ path: currentPath.join('.'), auth: value._def.meta?.auth });
      }
    } else if (value !== null && typeof value === 'object') {
      results.push(...collectMutations(value as Record<string, unknown>, currentPath));
    }
  }

  return results;
}

describe('write fence coverage', () => {
  const mutations = collectMutations(appRouter._def.record);

  it('全 mutation procedure が protectedProcedure 由来（auth meta 付き）である', () => {
    const withoutAuthMeta = mutations.filter(
      (mutation) => !['protected', 'pro'].includes(mutation.auth ?? ''),
    );

    expect(withoutAuthMeta.map((mutation) => mutation.path)).toEqual([]);
  });

  it('mutation procedure が 1 件以上存在する（このテストが空振りで通っていないことの確認）', () => {
    expect(mutations.length).toBeGreaterThan(0);
  });
});
