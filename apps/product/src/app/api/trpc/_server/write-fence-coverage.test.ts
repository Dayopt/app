import { describe, expect, it } from 'vitest';

import { appRouter } from '@/app/api/trpc/_server/app-router';

/**
 * 全 procedure（mutation / query 両方）が write fence（protectedProcedure / entitledProcedure
 * 経由）を通ることを機械的に保証する。fence check は protectedProcedure の middleware に
 * しか無いため、将来 t.procedure を直接使う procedure が追加されると fence を素通りする —
 * meta.auth の有無でそれを検出する（`auth: 'protected' | 'pro'` は protectedProcedure /
 * entitledProcedure だけが .meta() で付与する）。
 *
 * このリポジトリに `publicProcedure` は存在しない（`apps/product/src/lib/trpc/procedures.ts`
 * が export するのは protectedProcedure / entitledProcedure のみ）。つまり mutation・query の
 * どちらも auth meta 無しは常に fence 漏れであり、query だけ緩める理由が無い
 * （元は mutation のみを対象にしていたが、query 41 本がこの網の外にあった。#2187 E-3）。
 *
 * router tree の歩き方は `scripts/tasks/generate-api-spec.ts` の `walkRouter` と同じ idiom
 * （`_def.procedure === true` で leaf procedure を判定し、それ以外はネストされた
 * router record として再帰する）。
 *
 * **type で絞り込まない**（#2323）。`collectProcedures` は元々
 * `type === 'mutation' || type === 'query'` の allowlist で絞っていたため、将来
 * `.subscription()` procedure が追加されると auth meta が無くてもこの集計から黙って
 * 外れる（本対応前の「query が網の外」だった穴と同型。risk-reviewer 指摘、2026-08-20）。
 * 「未知の type を検出したら赤」という点の追加ではなく、**leaf procedure は type を
 * 問わず常に fence 対象**という不変条件そのものを守る形にする（`AGENTS.md §PR / git 運用`
 * §同型指摘の打ち切り の「点の追加ではなく class ごと閉じる」に倣う）。
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
      // type で絞り込まない（#2323）。mutation/query の allowlist にすると、将来
      // subscription 等の新種 procedure が auth meta 無しで追加された時にこの集計から
      // 黙って外れる。leaf procedure は常に fence 対象、が守るべき不変条件。
      results.push({
        path: currentPath.join('.'),
        type: value._def.type,
        auth: value._def.meta?.auth,
      });
    } else if (value !== null && typeof value === 'object') {
      results.push(...collectProcedures(value as Record<string, unknown>, currentPath));
    }
  }

  return results;
}

describe('write fence coverage', () => {
  const procedures = collectProcedures(appRouter._def.record);

  it('全 procedure が protectedProcedure 由来（auth meta 付き）である', () => {
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

describe('procedure type coverage（type allowlist からの取りこぼしを防ぐ、#2323）', () => {
  it('block: auth meta の無い subscription procedure を検出する（type filter で黙って漏れない）', () => {
    const fakeRouterRecord = {
      leakySubscription: { _def: { procedure: true, type: 'subscription' } },
    };

    const procedures = collectProcedures(fakeRouterRecord);
    const withoutAuthMeta = procedures.filter(
      (procedure) => !['protected', 'pro'].includes(procedure.auth ?? ''),
    );

    expect(withoutAuthMeta.map((procedure) => `${procedure.type}:${procedure.path}`)).toEqual([
      'subscription:leakySubscription',
    ]);
  });

  it('pass: auth meta 付きの subscription procedure は違反として検出されない', () => {
    const fakeRouterRecord = {
      guardedSubscription: {
        _def: { procedure: true, type: 'subscription', meta: { auth: 'protected' } },
      },
    };

    const procedures = collectProcedures(fakeRouterRecord);
    const withoutAuthMeta = procedures.filter(
      (procedure) => !['protected', 'pro'].includes(procedure.auth ?? ''),
    );

    expect(withoutAuthMeta).toEqual([]);
  });

  it('collectProcedures は mutation/query/subscription のいずれも type で除外しない', () => {
    const fakeRouterRecord = {
      a: { _def: { procedure: true, type: 'mutation', meta: { auth: 'protected' } } },
      b: { _def: { procedure: true, type: 'query', meta: { auth: 'protected' } } },
      c: { _def: { procedure: true, type: 'subscription', meta: { auth: 'protected' } } },
    };

    const procedures = collectProcedures(fakeRouterRecord);

    expect(procedures.map((procedure) => procedure.type).sort()).toEqual([
      'mutation',
      'query',
      'subscription',
    ]);
  });
});
