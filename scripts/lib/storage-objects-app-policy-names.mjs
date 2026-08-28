/**
 * `storage.objects` の RLS policy のうち、このリポジトリの migration が定義したものだけを
 * "app 所有" として扱う allow-list（signal / noise 分離。#1900）。
 *
 * `storage` schema は Supabase platform 自身も所有し、バージョンアップで内容が変わりうる
 * （このリポジトリの migration に一度も登場しない buckets_analytics / buckets_vectors /
 * iceberg_namespaces / iceberg_tables / vector_indexes が現に存在するのが証拠）。
 * schema 丸ごとを追跡すると platform 更新のたびに無関係な drift が出るため、対象を
 * `storage.objects` 1 つに絞り、この名前リストに合致する policy だけを追跡する。
 *
 * ## 参照元（二重管理しない、#2323）
 *
 * この配列は次の 2 箇所から参照される単一の正本:
 *
 * - `scripts/tasks/generate-rls-snapshot.ts`（`pnpm rls:snapshot`） — migration から構築した
 *   ephemeral な local DB を対象にした snapshot 生成 + drift 検出
 * - `scripts/ci/production-storage-rls-audit.mjs` — production の実 DB を対象にした
 *   継続的 drift 検出（#2323。local snapshot は migration 由来の DB しか見ないため、
 *   production だけに残存した legacy policy（#2316 の root cause）を検出できなかった）
 *
 * 元は `generate-rls-snapshot.ts` にインライン定義されていたが、production 側の検出を
 * 追加するにあたり両者が別々に持つと定義が drift しうるため、この共有モジュールへ抽出した。
 *
 * 出典: supabase/migrations/20260730090027_fence_account_storage.sql（現行定義）。
 * この配列を変える時は同じ PR でその migration の変更を伴う。
 */
/** @type {readonly string[]} */
export const STORAGE_OBJECTS_APP_POLICY_NAMES = [
  'Users can delete own attachments',
  'Users can delete own avatar',
  'Users can update own attachments',
  'Users can update own avatar',
  'Users can upload own attachments',
  'Users can upload own avatar',
  'Users can view own attachments',
  'Users can view own avatar',
];

/**
 * SQL の文字列リテラルリスト（`IN (...)` 用）を組み立てる。値は上の const 配列のみで外部入力は通さない。
 *
 * この module は plain `.mjs`（`generate-rls-snapshot.ts` の TS 側と、token を持つ
 * `production-storage-rls-audit.mjs` の plain node 実行の両方から素の import で読めるように
 * するための意図的な選択、#2323）なので、`tsconfig.scripts.json` の `checkJs: false` により
 * この JSDoc は型検査されない（解決のためだけに `allowJs` が効く）。呼び出し側で
 * `readonly string[]` として扱われることを示す注釈として残す。
 *
 * @param {readonly string[]} values
 * @returns {string}
 */
export function sqlStringList(values) {
  return values.map((v) => `'${v.replace(/'/g, "''")}'`).join(', ');
}
