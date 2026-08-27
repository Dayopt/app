/**
 * `public` 契約露出 guard の契約を固定する（#2433）。
 *
 * 実行: USE_LOCAL_DB=true pnpm test:integration
 * RUN_LOCAL が false だと describe ごと skip されるため、**passed 件数を読む**こと。
 * skipped は緑に見えるが何も検証していない。
 *
 * `private.public_contract_exposure_v1` は第7段（canonical projection）が持ち込む
 * view / RPC に対する tripwire で、**現時点では違反 0 件を返す**。対象が存在しない guard は
 * 「常に緑」になりやすく、壊れていても気づけない。だからここでは
 *
 *   1. 違反を**実際に作って**検出されること（壊して落ちることの確認）
 *   2. assertion が例外で止まること
 *   3. 片付けたら 0 件に戻ること
 *
 * を回す。1 が無いと「guard が動いている」ことの証拠が何も無い。
 *
 * あわせて、guard の検査対象 schema が `supabase/config.toml` の `[api] schemas`
 * （PostgREST の公開面）と一致していることを assert する。config.toml へ schema を足した
 * のに guard を広げ忘れると、**新しい公開面が無検査で通る**（内製クロスレビュー P3）。
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const RUN_LOCAL = process.env.USE_LOCAL_DB === 'true';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../..');
const CONFIG_TOML = resolve(REPO_ROOT, 'supabase/config.toml');

function runOwnerSql(sql: string): string {
  return execFileSync(
    'psql',
    [
      '-X',
      '-qAt',
      '-v',
      'ON_ERROR_STOP=1',
      '-h',
      '127.0.0.1',
      '-p',
      '54322',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-c',
      sql,
    ],
    { encoding: 'utf8', env: { ...process.env, PGPASSWORD: 'postgres' } },
  ).trim();
}

/** `supabase/config.toml` の `[api]` セクションから `schemas = [...]` を読む。 */
function postgrestExposedSchemas(): string[] {
  const toml = readFileSync(CONFIG_TOML, 'utf8');
  const apiSection = toml.split(/^\[/m).find((section) => section.startsWith('api]'));
  if (!apiSection) throw new Error('[api] section not found in supabase/config.toml');
  const match = /^schemas\s*=\s*\[([^\]]*)\]/m.exec(apiSection);
  if (!match) throw new Error('[api] schemas not found in supabase/config.toml');
  return [...match[1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
}

const violationCount = () =>
  Number(runOwnerSql('SELECT count(*) FROM private.public_contract_exposure_v1;'));

describe.skipIf(!RUN_LOCAL)('public contract exposure guard (#2433)', () => {
  it('config.toml の [api] schemas を読めている（パーサが空振りしていない）', () => {
    const schemas = postgrestExposedSchemas();
    expect(schemas.length).toBeGreaterThan(0);
    expect(schemas).toContain('public');
  });

  it('guard の検査対象が PostgREST の公開面をすべて含む', () => {
    // guard の schema 配列は view 定義の中にある。**どの migration が作ったかに依存しない**
    // よう、file ではなく live な定義を見る（guard を作り直す migration が来ても壊れない）。
    const definition = runOwnerSql(
      "SELECT pg_get_viewdef('private.public_contract_exposure_v1'::regclass, true);",
    );
    const missing = postgrestExposedSchemas().filter((schema) => !definition.includes(schema));
    expect(
      missing,
      missing.length === 0
        ? ''
        : [
            `guard が検査していない公開 schema: ${missing.join(', ')}`,
            '',
            'supabase/config.toml の [api] schemas へ schema を足したら、',
            'private.public_contract_exposure_v1 の exposed_schemas 配列にも足すこと。',
            '足さないと、新しい公開面が無検査のまま PostgREST から見えるようになる。',
          ].join('\n'),
    ).toEqual([]);
  });

  it('規約を守った状態では違反 0 件', () => {
    expect(violationCount()).toBe(0);
  });

  describe('違反を実際に作って検出されることを確認する', () => {
    it('security_invoker なし・命名規約違反・anon 到達可能をそれぞれ検出する', () => {
      try {
        runOwnerSql('CREATE VIEW public.tmp_guard_probe AS SELECT id, user_id FROM public.plans;');
        const kinds = runOwnerSql(
          "SELECT DISTINCT violation_kind FROM private.public_contract_exposure_v1 WHERE object_name = 'public.tmp_guard_probe' ORDER BY 1;",
        )
          .split('\n')
          .filter(Boolean);

        expect(kinds).toContain('view_missing_security_invoker');
        expect(kinds).toContain('view_unversioned_name');
        // 新規 view には Supabase の default ACL で anon 権限が付く。明示的な REVOKE を
        // 忘れた view を捕まえるのが、この guard の実務上いちばん効く部分。
        expect(kinds).toContain('view_anon_privilege');
      } finally {
        runOwnerSql('DROP VIEW IF EXISTS public.tmp_guard_probe;');
      }
    });

    it('assertion が違反時に例外で止まる（fail closed）', () => {
      try {
        runOwnerSql('CREATE VIEW public.tmp_guard_probe2 AS SELECT id FROM public.plans;');
        expect(() => runOwnerSql('SELECT private.assert_public_contract_exposure_v1();')).toThrow();
      } finally {
        runOwnerSql('DROP VIEW IF EXISTS public.tmp_guard_probe2;');
      }
    });

    it('片付けたら 0 件に戻る（probe が残骸を残していない）', () => {
      expect(violationCount()).toBe(0);
    });
  });

  it('規約を守った view は違反にならない（REVOKE 込み）', () => {
    try {
      runOwnerSql(`
        CREATE VIEW public.tmp_guard_ok_v1 WITH (security_invoker = true)
          AS SELECT id, user_id FROM public.plans;
        REVOKE ALL ON TABLE public.tmp_guard_ok_v1 FROM PUBLIC, anon, authenticated;
      `);
      const rows = runOwnerSql(
        "SELECT count(*) FROM private.public_contract_exposure_v1 WHERE object_name = 'public.tmp_guard_ok_v1';",
      );
      expect(Number(rows)).toBe(0);
    } finally {
      runOwnerSql('DROP VIEW IF EXISTS public.tmp_guard_ok_v1;');
    }
  });
});
