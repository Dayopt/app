import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import {
  STORAGE_OBJECTS_APP_POLICY_NAMES,
  sqlStringList,
} from './lib/storage-objects-app-policy-names.mjs';
import { SUPABASE_PRODUCTION_PROJECT_REF } from './production-auth-config-audit.mjs';

/**
 * production の `storage.objects` RLS drift を継続検出する（#2323）。
 *
 * `pnpm rls:snapshot:check`（`scripts/generate-rls-snapshot.ts`）は migration から構築した
 * **ephemeral な local DB** しか見ない。production の実 state（Dashboard 経由の手動変更、
 * migration の DROP 漏れで残存した legacy policy 等）はこれまで一度も直接検査されて
 * こなかった —— #2316 の root cause（`_archive/20251024022910_remote_schema.sql` /
 * `_archive/20251218072948_create_attachments_bucket.sql` が作った legacy policy が
 * 一度も DROP されず production にだけ残存していた）はまさにこの盲点が実際に踏まれた例で、
 * この script はその再発を検出する。
 *
 * ## 接続経路（read-only）
 *
 * Supabase Management API の `POST /v1/projects/{ref}/database/query` を
 * `read_only: true` フラグ付きで叩く。このフラグは API サーバー側で強制され、書き込み系
 * SQL は拒否される（クライアントの自己申告ではない。
 * https://supabase.com/docs/reference/api/v1-run-a-query）。token 自体も `database_read`
 * 権限のみを持つ scoped project token を使う運用を前提にする（発行手順は #2345）。
 *
 * **ただし `database_read` は table 単位で絞れない。** この token は production の
 * schema 全体（`auth.users` を含む）への SELECT を許可する広い scope で、
 * `storage.objects` だけに絞る Supabase 側の機能は無い（2026-08-24 時点）。実際にこの
 * script が実行する SELECT は `storage.objects` の policy 名と RLS 状態のみに限定して
 * いるが、それは script の実装が守る境界であって token 自体の scope ではない。
 *
 * ## 保証境界（どこまでを守り、どこからを守らないか）
 *
 * `.claude/rules/workflow.md` §同型指摘の打ち切り に倣い、守る範囲を先に宣言する。
 *
 * **守る**:
 *
 * 1. `storage.objects` の policy 名が `STORAGE_OBJECTS_APP_POLICY_NAMES`
 *    （`./lib/storage-objects-app-policy-names.mjs` が正本）の外に出ていないか
 * 2. `storage.objects` の RLS が有効なままか（policy が残っていても
 *    `ENABLE ROW LEVEL SECURITY` が外れれば無力化される。local snapshot の
 *    `fetchStorageObjectsRls()` と同じ懸念）
 * 3. `storage.objects` に想定外の `FORCE ROW LEVEL SECURITY` が付いていないか
 *    （この repo は使っていない設定なので、値の変化自体が意図しない変更のシグナル）
 *
 * **守らない**:
 *
 * - **policy の USING / WITH CHECK 句の中身は誰も見ていない。** allow-list に載った
 *   policy 名の句が Dashboard 経由で `true` へ書き換えられても、この script は検出
 *   しない（policy 名だけを追跡するため）。local snapshot（`generate-rls-snapshot.ts`）
 *   も migration から構築した ephemeral DB しか見ないため、production の実際の句の内容
 *   はこの 2 script のどちらにもカバーされない
 * - `storage.objects` 以外の table の policy、`storage.buckets` の public フラグ等
 *   （production-config-audit.mjs の Vercel drift、production-auth-config-audit.mjs の
 *   Auth drift と同様、この script は 1 つの狭い一次防御線として設計する。拡張は別 issue）
 * - migration を経由しない DB スキーマ変更全般（table 追加・GRANT 変更等）。あくまで
 *   `storage.objects` の RLS 境界のみ
 */

async function runReadOnlyQuery({ projectRef, token, query, fetchImpl }) {
  const response = await fetchImpl(
    `https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, read_only: true }),
    },
  );

  // 本文に予期しない内容が含まれた場合に備え、失敗時はレスポンスをそのまま出力しない
  // （production-auth-config-audit.mjs と同じ不変条件）。
  if (!response.ok) {
    throw new Error(
      `Supabase database query request failed for project: ${projectRef} (status ${response.status})`,
    );
  }

  try {
    return await response.json();
  } catch {
    throw new Error(`Supabase database query response was not JSON for project: ${projectRef}`);
  }
}

/** contract test（read-only SQL のみであることの機械固定）のため export する。 */
export function buildQuery() {
  return `SELECT
    (SELECT coalesce(json_agg(policyname ORDER BY policyname), '[]'::json)
     FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname NOT IN (${sqlStringList(STORAGE_OBJECTS_APP_POLICY_NAMES)})) AS unexpected_policies,
    (SELECT c.relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'storage' AND c.relname = 'objects') AS rls_enabled,
    (SELECT c.relforcerowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'storage' AND c.relname = 'objects') AS rls_forced;`;
}

/**
 * fail closed: 想定外の response shape は「確認できた」に倒さない
 * （production-auth-config-audit.mjs の key 欠落判定と同じ思想）。
 */
export function auditProductionStorageRls(rows) {
  if (!Array.isArray(rows) || rows.length !== 1) {
    return [
      `production storage RLS query returned an unexpected shape (expected exactly 1 row, got ${
        Array.isArray(rows) ? `${rows.length} rows` : typeof rows
      })`,
    ];
  }

  const row = rows[0];
  if (
    !row ||
    typeof row !== 'object' ||
    !Array.isArray(row.unexpected_policies) ||
    typeof row.rls_enabled !== 'boolean' ||
    typeof row.rls_forced !== 'boolean'
  ) {
    return ['production storage RLS query returned an unexpected row shape'];
  }

  const errors = [];

  if (row.unexpected_policies.length > 0) {
    errors.push(
      `unexpected storage.objects policy on production: ${row.unexpected_policies.join(', ')}. ` +
        'app 所有なら STORAGE_OBJECTS_APP_POLICY_NAMES へ追加してから production へ反映する。' +
        'そうでなければ legacy policy を DROP する migration を作る（#2316 と同型の drift）。',
    );
  }

  if (row.rls_enabled !== true) {
    errors.push(
      'storage.objects の RLS が無効化されています（ENABLE ROW LEVEL SECURITY が外れている）',
    );
  }

  if (row.rls_forced === true) {
    errors.push(
      'storage.objects で ROW LEVEL SECURITY が FORCE されています（この repo は使っていない設定 — 想定外の変更）',
    );
  }

  return errors;
}

export async function runProductionStorageRlsAudit({
  token,
  projectRef = SUPABASE_PRODUCTION_PROJECT_REF,
  fetchImpl = fetch,
}) {
  if (!token) {
    throw new Error(
      'SUPABASE_STORAGE_RLS_AUDIT_TOKEN is required for Production Storage RLS Audit',
    );
  }

  const rows = await runReadOnlyQuery({ projectRef, token, query: buildQuery(), fetchImpl });
  const errors = auditProductionStorageRls(rows);

  if (errors.length > 0) {
    throw new Error(
      `Production Storage RLS Audit failed:\n${errors.map((e) => `- ${e}`).join('\n')}`,
    );
  }
}

/** production-auth-config-audit.mjs と同じ正規化比較（symlink / 空白 path 対応）。 */
function isDirectExecution() {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}

if (isDirectExecution()) {
  const token = process.env.SUPABASE_STORAGE_RLS_AUDIT_TOKEN;

  if (!token) {
    // token 未発行の間は fail ではなく notice で明示する（#2323 の fast-follow issue で
    // 発行するまでの既定状態）。fail にすると「まだ検出が有効になっていない」ことと
    // 「実際に drift を検出した」ことが同じ赤 X になり、区別がつかなくなる。
    // かといって黙って exit 0 にすると「green に見えるが実は何も見ていない」状態が
    // 恒久化する（fail-open の亜種）。`::notice::` で毎回明示することで、盤面から
    // 見えたまま未稼働状態を可視化する。
    console.log(
      '::notice title=Production Storage RLS Audit is inactive::SUPABASE_STORAGE_RLS_AUDIT_TOKEN is not configured yet. storage.objects drift detection is skipped until the token is provisioned.',
    );
    process.exitCode = 0;
  } else {
    runProductionStorageRlsAudit({ token })
      .then(() => {
        console.log('Production Storage RLS Audit passed (storage.objects allow-list only).');
      })
      .catch((error) => {
        console.error(
          error instanceof Error ? error.message : 'Production Storage RLS Audit failed',
        );
        process.exitCode = 1;
      });
  }
}
