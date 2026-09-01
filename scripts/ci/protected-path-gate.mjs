#!/usr/bin/env node

/**
 * Protected Path Gate - determines from a changed-files list whether the
 * internal cross-review marker gate (`[internal-review]`) should be required
 * for a PR (#2478, tempo-linked review gate).
 *
 * The old design required internal cross-review on every PR uniformly. This
 * script narrows that requirement to PRs that touch protected paths. It is the
 * single source of truth consumed by the merge gate in
 * `scripts/tasks/finish-branch.sh` (the glob list is not duplicated in bash to
 * avoid drift).
 *
 * The selection criterion is "external contract or irreversible" (#2489,
 * 2026-08-31): a mistake there is not caught by CI and cannot be undone by a
 * revert alone - it leaks across a tenant boundary, breaks an existing external
 * consumer, mutates production data, or disables the guardrails themselves.
 *
 * Dayopt's core time invariants (timezone / half-open interval / overlap) were
 * dropped from this list in the same change. They are reversible in-app
 * behavior covered by unit tests and CI, and keeping them here put nearly every
 * product PR on the required side - which, combined with cloud sessions where
 * `Workflow` / `Agent` are disabled by default (#2472), stalled merges instead
 * of adding review. `review:full` remains the manual escalation for a PR that
 * deserves the heavier review without matching a glob.
 *
 * Retreat condition for that call: see AGENTS.md §レビュー (the sentence
 * referencing #2489 / #2503) for when a PR must carry `review:full` by hand
 * even though nothing here re-checks it. Described once there, not
 * duplicated here, to avoid two sources of truth drifting apart.
 *
 * Usage:
 *   printf '%s\n' file1 file2 | node scripts/ci/protected-path-gate.mjs --stdin
 *   node scripts/ci/protected-path-gate.mjs apps/product/src/features/auth/foo.ts
 *
 * Output: `{"required": true, "reason": "<matched glob>"}` or
 * `{"required": false}`.
 *
 * Design notes:
 * - Unknown paths are simply a non-match (they do not push the verdict
 *   toward required). Unlike the Impact Resolver (scripts/ci/impact.mjs)
 *   this is an allowlist check ("does this touch a protected area?"), not a
 *   "what needs to build" check, so fail-closed here means "any glob match
 *   -> required", not "unknown -> required".
 * - Fail-closed behavior for empty input / missing node is the caller's
 *   responsibility (scripts/tasks/finish-branch.sh) - if node is missing
 *   this script cannot even run, so that branch cannot live here.
 * - Keep this glob list distinct from the
 *   dispatch skill（旧 orchestration.md、#2479 で再編） high-risk-PR Codex review selection
 *   criteria (that one picks PRs for the optional Codex layer; this one
 *   decides whether the internal marker gate is required).
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * `.github/workflows/production-config-audit.yml` の self-change 検出
 * （`grep -Eq '^(...)$'`、`Detect audit contract changes` step）がリテラルで
 * 持つ 4 path。あちらは PR 由来の checkout を使わない trusted-base 判定用の
 * 別経路（Vercel token を PR code から隔離する）で、こちらの marker gate と
 * 目的は違うが対象は同じ 4 つの契約ファイルなので、リストの重複をここでは
 * named export にしてテスト（`scripts/__tests__/protected-path-gate-contract.test.ts`）
 * から両者の一致を機械的に固定する。どちらか一方だけ変えるとテストが落ちる。
 */
export const PRODUCTION_CONFIG_AUDIT_CONTRACT_PATHS = [
  'scripts/ci/production-config-audit.mjs',
  'apps/product/production-build-gate.mjs',
  'apps/web/production-build-gate.mjs',
  '.github/workflows/production-config-audit.yml',
];

/**
 * Protected path globs (OR'd together). If any changed file matches one of
 * these, the internal cross-review marker gate becomes required. Add or
 * remove entries only in this array (finish-branch.sh does not keep a copy).
 */
export const PROTECTED_PATH_GLOBS = [
  // auth / OAuth / MCP integrations
  'apps/product/src/features/auth/**',
  'apps/product/src/app/oauth/**',
  'apps/product/src/app/[locale]/oauth/**',
  'apps/product/src/app/api/oauth/**',
  'apps/product/src/app/.well-known/oauth-authorization-server/**',
  'apps/product/src/app/.well-known/oauth-protected-resource/**',
  'apps/product/src/app/api/integrations/**',
  'apps/product/src/app/mcp/**',
  'apps/product/src/app/api/mcp/**',
  // MCP の認証 / 認可 + service role（RLS を迂回する）アクセス面全体（#2503 監査）。
  'apps/product/src/lib/mcp/**',
  // DB / migrations
  'supabase/migrations/**',
  'supabase/functions/**',
  // billing
  'apps/product/src/lib/stripe/**',
  'apps/product/src/lib/billing/**',
  'apps/product/src/app/api/webhooks/**',
  'apps/product/src/features/settings/server/billing-*.ts',
  // external calendar integrations
  'apps/product/src/features/external-calendar/server/providers/**',
  // アカウント削除に伴う外部 calendar データの不可逆な一括削除を駆動する cron（#2503 監査）。
  'apps/product/src/app/api/cron/calendar-account-deletion-settle/**',
  // 不可逆な purge 本体 + provider 側 token の revoke（#2503 監査）。
  'apps/product/src/features/external-calendar/server/account-deletion.ts',
  // rotation を誤ると唯一の refresh token が失効し、以後そのアカウントの sync が復旧できない（#2503 監査）。
  'apps/product/src/features/external-calendar/server/token-rotation.ts',
  // provider 側の revoke は一方向操作で、実行してしまえば取り消せない（#2503 監査）。
  'apps/product/src/features/external-calendar/server/revoke-outbox.ts',
  // timeblock feature の server 側だけに同居する高リスク面（#2489 クロスレビュー P1）。
  // feature 全体は必須側から外したが、この 2 つは「外部契約 or 不可逆」に該当するため
  // 残す: mcp-* は MCP の公開契約 + service role（RLS を迂回する）クエリ、
  // private-timeblock-search-query.ts は検索語を Sentry から隔離する privacy 境界。
  'apps/product/src/features/timeblock/server/mcp-*',
  'apps/product/src/features/timeblock/server/private-timeblock-search-query.ts',
  // system API
  'apps/product/src/app/api/v1/system/**',
  // the guardrails themselves
  '.husky/**',
  'scripts/hooks/**',
  'scripts/tasks/finish-branch.sh',
  'scripts/ci/protected-path-gate.mjs',
  // レビュー証跡の生成・検証そのもの（#2529 / #2530 の Codex Issue Review P2）。
  // これらは head SHA / fingerprint の実測と書式強制を担う trust boundary で、
  // 「空出力を成功扱いにする」「任意の識別子を受け入れる」といった変更が入れば
  // gate は green のまま無効化される（CI では捕まらない、revert だけでは
  // 取り戻せない）。判定基準「外部契約 or 不可逆」の後段そのものなので、
  // ガードレール自己保護として必須側に置く。**Codex レビュー対象の通常 PR の
  // 範囲を広げる変更ではない**（product path の選別基準は不変）。
  'scripts/tasks/issue-review-gate.mjs',
  'scripts/lib/issue-review-core.mjs',
  'scripts/tasks/generate-issue-review-marker.mjs',
  'scripts/tasks/generate-marker.ts',
  'scripts/lib/generate-marker-core.ts',
  // CI の中枢。check.mjs は write 権限つき GH_TOKEN を PR コードから隔離する
  // 処理とどの test を skip するかの判定を持ち、ci.yml はその job / permissions
  // を決める。どちらも「壊れても CI は green のまま」になりうるため、
  // guardrail として必須側に置く（#2483 クロスレビュー、risk-reviewer 指摘）。
  'scripts/ci/check.mjs',
  '.github/workflows/ci.yml',
  ...PRODUCTION_CONFIG_AUDIT_CONTRACT_PATHS,
];

/**
 * Minimal glob matcher with the same semantics as GitHub Actions `paths`:
 * `*` matches within one path segment, `**` matches across segments.
 * Implemented as a single regex replace with a callback so no placeholder
 * token is needed to disambiguate `*` from `**`.
 */
function globToRegExp(glob) {
  const escapedGlob = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const pattern = escapedGlob.replace(/\*\*|\*/g, matchOneOrTwoStars);
  return new RegExp(`^${pattern}$`);
}

function matchOneOrTwoStars(token) {
  if (token === '**') return '.*';
  return '[^/]*';
}

const MATCHERS = PROTECTED_PATH_GLOBS.map((glob) => ({ glob, re: globToRegExp(glob) }));

/**
 * @param {string[]} changedFiles
 * @returns {{ required: true, reason: string } | { required: false }}
 */
export function resolveProtectedPathGate(changedFiles) {
  const files = changedFiles.map((f) => f.trim()).filter(Boolean);

  for (const file of files) {
    for (const matcher of MATCHERS) {
      if (matcher.re.test(file)) {
        return { required: true, reason: matcher.glob };
      }
    }
  }

  return { required: false };
}

// --- CLI -------------------------------------------------------------

async function readStdinLines() {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data.split('\n');
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const args = process.argv.slice(2);
  const useStdin = args.includes('--stdin');
  const fileArgs = args.filter((a) => !a.startsWith('--'));

  const files = useStdin ? await readStdinLines() : fileArgs;
  const result = resolveProtectedPathGate(files);

  process.stdout.write(`${JSON.stringify(result)}\n`);
}
