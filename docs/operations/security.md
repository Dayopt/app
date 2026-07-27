---
status: current
last_verified: 2026-07-27
---

# セキュリティ方針

GitHub Actionsのセキュリティ設定、OWASP準拠のセキュリティ監視・レポート、環境変数/Secrets管理の運用を集約する。Secretsの値そのものの管理手順は [secrets.md](./secrets.md) を参照。

---

# 第1部: GitHub Actions セキュリティ設定ガイド

**参考**: [GitHub Actions Security Hardening](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions)

## ワークフロー構成

```
.github/
  dependabot.yml              # 依存関係自動更新
  workflows/
    ci.yml                    # static + unit + build + client bundle secret 検査 + Playwright E2E
    ai-review.yml             # 危険 path 限定の外部モデル diff レビュー
    production-config-audit.yml  # Vercel environment metadata 監査
    docs-guard.yml            # docs整合性チェック
    integration.yml           # Supabase 統合テスト + RLS snapshot drift 検査
    create-release.yml        # GitHub Release 作成
    release.yml               # リリース処理
```

## 権限設計

全ワークフローで最小権限の原則を適用。PRコメントbot は廃止済みのため `pull-requests: write` は不要。

### ワークフロー別 permissions

| ワークフロー         | permissions       | 理由                 |
| -------------------- | ----------------- | -------------------- |
| `ci.yml`             | `contents: read`  | コード読み取りのみ   |
| `docs-guard.yml`     | `contents: read`  | docs読み取りのみ     |
| `integration.yml`    | `contents: read`  | コード読み取りのみ   |
| `create-release.yml` | `contents: write` | タグからリリース作成 |

## リポジトリ設定

### Workflow Permissions

**設定場所**: `Settings` → `Actions` → `General` → `Workflow permissions`

```
✅ Read repository contents and packages permissions
□ Allow GitHub Actions to create and approve pull requests
```

### Actions Permissions

**設定場所**: `Settings` → `Actions` → `General` → `Actions permissions`

```
✅ Allow enterprise, and select non-enterprise, actions and reusable workflows

  Allow actions created by GitHub: ✅
  Allow actions by Marketplace verified creators: ✅

  Allow specified actions and reusable workflows:
    actions/*,
    github/*,
    supabase/setup-cli@*,
    softprops/action-gh-release@*
```

### Branch Protection（Required Checks）

**設定場所**: `Settings` → `Branches` → `main` → `Require status checks`

```
Required checks:
  ✅ Lint
  ✅ TypeScript
  ✅ Unit Tests
  ✅ Build
  ✅ Supabase Preview Branch
```

Storybook browser testはlight / darkとも既知failureがあるためrequiredから除外。#1499 / #1586 を解消し、両suiteが継続してgreenになってから昇格を再判断する。

### Fork Pull Request

**設定場所**: `Settings` → `Actions` → `General` → `Fork pull request workflows`

```
✅ Require approval for first-time contributors
```

## Supply Chain 対策

### Actions の SHA 固定

全ワークフローで SHA 固定 + バージョンコメントを使用:

```yaml
uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11 # v4.1.1
uses: actions/setup-node@2028fbc5c25fe9cf00d9f06a71cc4710d4507903 # v6.0.0
uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2
```

Dependabot が SHA 固定でも自動更新 PR を作成する。

### SHA 固定の一括変換

```bash
npm install -g pin-github-action
pin-github-action .github/workflows/*.yml
```

## Secrets 管理（GitHub Actions）

### 使用中の Secrets

| Secret                          | 用途              | ワークフロー                   |
| ------------------------------- | ----------------- | ------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase 接続     | ci, e2e                        |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 匿名キー | ci, e2e                        |
| `NEXT_PUBLIC_APP_URL`           | アプリ URL        | ci, e2e                        |
| `SUPABASE_ACCESS_TOKEN`         | Supabase CLI 認証 | emergency only / local scripts |

Migration は Supabase GitHub integration が担当する。GitHub Actions から `supabase db push` は通常実行しない。

### ベストプラクティス（GitHub Actions Secrets）

- 環境変数経由で使用（自動マスキング）
- `echo` で Secrets を出力しない
- フォールバック値はビルド用プレースホルダーのみ

## 監査（GitHub Actions）

```bash
# Secrets 一覧確認
gh secret list

# 最近の失敗確認
gh run list --limit 20 --status failure

# Actions バージョン確認
grep -r "uses:" .github/workflows/ | grep -v "^#" | sort | uniq
```

## 参考リンク（GitHub Actions）

- [Security Hardening for GitHub Actions](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions)
- [Automatic token authentication](https://docs.github.com/en/actions/security-guides/automatic-token-authentication)
- [pin-github-action](https://github.com/mheap/pin-github-action)
- [actionlint](https://github.com/rhysd/actionlint)

---

# 第2部: セキュリティ監視・レポート

OWASP準拠のセキュリティ監視の全体像と、定期検査の cadence を定義する。

**関連Issue**: [#487 - OWASP準拠のセキュリティ強化](https://github.com/Dayopt/dayopt/issues/487)

## レビュー体制の層マップ

セキュリティレビューは 4 層で構成する。どの層も単独では完全でなく、コード変更起点（1・2）と時間経過起点（3・4）を組み合わせて成立させる。

| 層         | タイミング          | 実体                                                                                                                                                                                         |
| ---------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 実装中     | コード変更ごと      | `security` skill（OWASP 観点のガイド）/ `risk-reviewer` の自動委任（`AGENTS.md` §Read-only delegation）                                                                                      |
| PR ごと    | CI                  | `ai-review.yml`（危険 path 限定の外部モデルレビュー）/ `integration.yml` の RLS snapshot drift 検査 / `ci.yml` の client bundle secret 検査・`secrets:check` / `production-config-audit.yml` |
| 継続       | 常時・自動          | Dependabot alerts（security update は schedule と無関係に即時 PR）/ Actions の SHA 固定 / Sentry / CSP 違反モニタリング / rate limit                                                         |
| 定期・随時 | 月次 + オンデマンド | `/gardening` §5.7 のセキュリティ sweep（advisors + `pnpm security:check` + `/claude-security` 提案）/ `/security-review` / `/code-review`                                                    |

**束ねた PR のレビュー**: 複数 issue / Step を束ねた PR は merge 前に read-only subagent のクロスレビューを必須とする（`.claude/rules/workflow.md` §PR 粒度）。

## 定期検査の cadence

定期検査の正本は `/gardening` §5.7（月次セキュリティ sweep）とする。実施内容:

1. Supabase security advisors の確認（`mcp__supabase__get_advisors`、read-only）
2. `pnpm security:check`（= `pnpm audit --audit-level=moderate`）
3. `/claude-security` の全体スキャン実行をユーザーへ提案

3 は `disable-model-invocation: true` のため AI 側から起動できない。実行はユーザーが `/claude-security` を叩く。結果は `CLAUDE-SECURITY-<timestamp>/` に出力され、`.gitignore` を同梱するため誤って commit されない。

所見が出た場合は `docs/operations/log/YYYY-MM-DD-security-sweep.md` に記録し、修正が必要なものは `dispatch` skill の intake で起票する。

> 2026-07-27 以前は週次自動レポート（`security-report.yml` / `npm run security:report` / `reports/security/`）を定義していたが、workflow は PR #957 で削除済みで実体が無かった。上記の月次 sweep がその後継。

## 監査ログ（Audit Logging）

アプリ側の独自監査ログテーブルは持たない。`login_attempts` / `auth_audit_logs` は Supabase Auth の `auth.audit_log` との二重管理でありアプリコードからの参照も無かったため、`20260414150000_drop_login_attempts_and_auth_audit_logs.sql` で削除済み。

現在の記録先:

| 対象                             | 記録先                                                                                  |
| -------------------------------- | --------------------------------------------------------------------------------------- |
| 認証イベント（ログイン・失敗等） | Supabase Auth の `auth.audit_log`（Supabase 側が管理。Dashboard / Auth log で参照）     |
| OAuth token 操作                 | `public.oauth_audit_log` テーブル（RLS 境界は `rls-access.integration.test.ts` で検証） |
| アプリ例外・セキュリティイベント | Sentry（CSP 違反は `csp-violation` として directive 単位の固定 fingerprint で送信）     |
| rate limit 超過                  | Upstash Redis のメトリクス（raw identifier は保存しない）                               |

認証攻撃の調査は Supabase Auth log と rate limit analytics を併用する（[monitoring](./monitoring.md) / [runbook](./runbook.md)）。

## レート制限統計

### Upstash Redis

**現在の状態**: Production で稼働中。`@upstash/ratelimit` / `@upstash/redis` は導入済みで、実装は [`apps/product/src/lib/rate-limit/upstash.ts`](../../apps/product/src/lib/rate-limit/upstash.ts)。

`UPSTASH_REDIS_REST_URL` と `UPSTASH_REDIS_REST_TOKEN` が両方設定されている場合のみ有効になる（`isUpstashEnabled`）。未設定の環境ではインメモリ実装にフォールバックする。値の注入は 1Password 経由で、手順は [secrets.md](./secrets.md) を正本とする。

**コスト**:

- 無料枠: 10,000リクエスト/日
- Dayopt想定: 3,000,000リクエスト/月
- 月額コスト: 約$6

## CSP違反モニタリング

Product / WebのCSPは各appのsecurity header設定で強制し、違反は各appの`/api/csp-report`へ送る。report endpointは公開入力境界として次を適用する。

- JSON bodyは16 KiBを上限とし、Zod schemaに合わないreportを400、上限超過を413で拒否する
- ProductionではSHA-256化したIP単位20/分と全体120/分のUpstash rate limitを適用し、超過時は429、backend unavailable時はbodyを読まず503を返す
- `application/csp-report`以外とProduct origin以外のdocument URIを拒否し、未知のdirectiveは`unknown`へ固定する
- document / blocked / source URLからqueryとfragmentを除去し、ブラウザ拡張由来の違反はSentryへ送らない
- WebではVercel Toolbarの`font-src`だけを、directive、blocked origin、既知font path（`/geist.woff2` / `/geist_mono.woff2`）で照合する。`source-file`がある場合はそのoriginも`https://vercel.live`に限定し、`source-file`が省略された場合だけmissingを許容する。未知font path、source origin不一致、lookalike originなどのnear-missは送信する
- 有効な違反だけを`csp-violation`として、directive単位の固定fingerprintでSentryへ送る

### 違反レポート確認

Sentry Issuesで`type:csp-violation`を指定し、directive、正規化済みblocked URI、releaseを確認する。生のURL queryやreport bodyをissue、docs、chatへ転記しない。

## セキュリティメトリクス

### 成功基準（KPI）

- HSTSとCSP enforcementがproduction responseに付くこと
- `/api/csp-report`のinvalid / oversized / rate-limited inputがSentry quotaを消費しないこと
- `pnpm security:check`とCIのsecurity checkが継続して成功すること
- SentryのCSP IssueにURL query、cookie、authorization、user contentが含まれないこと

### ダッシュボード（セキュリティ）

- 月次セキュリティ sweep の結果（`/gardening` §5.7）
- `pnpm security:check` 結果（CI の static lane に統合）
- Dependabot alerts / Supabase security advisors
- Upstash Redis request / latency / error metrics（Ratelimit Analyticsとraw identifier保存は無効）
- Sentry Issues / quota / discarded event

## アラート（セキュリティ）

Sentryの高優先度Issue通知はemailを正規channelとする。認証失敗やvalidation errorなどのexpected errorはIssue化せず、認証攻撃の調査はSupabase Auth logとrate limit analyticsを併用する。閾値と対応手順は[monitoring](./monitoring.md)と[runbook](./runbook.md)を正とする。

## 関連ドキュメント（セキュリティ監視）

- [Error Handling](../../apps/product/src/lib/errors/index.ts)
- [Rate Limiting](../../apps/product/src/lib/rate-limit/upstash.ts)
- [Issue #487](https://github.com/Dayopt/dayopt/issues/487)

## 外部リソース（セキュリティ監視）

- [OWASP Top 10:2021](https://owasp.org/Top10/)
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- [Upstash Rate Limiting](https://upstash.com/docs/redis/features/ratelimiting)
- [Mozilla Observatory](https://observatory.mozilla.org/)
- [SecurityHeaders.com](https://securityheaders.com/)

---

# 第3部: 環境変数・Secrets 運用

環境変数と Secrets の値そのものの管理（1Password 経由の注入、schema、ローテーション手順）は [secrets.md](./secrets.md) を正本とする。本ファイルでは重複を避けるため、GitHub Actions 側の利用箇所（第1部）とセキュリティ監視の対象範囲（第2部）のみを扱う。

GitHub / Vercel / Supabase側のreplicaとenvironment scopeは[environment-secrets.md](./security/environment-secrets.md)に分冊する。AIも値を出力せず、通常のrepo fileとして両文書を参照する。

---

# 第4部: Supabase RPC 権限

Issue #1564 で、Production Security Advisorの
`authenticated_security_definer_function_executable` 13件を次の契約へ整理した。

## RPC判断表

| RPC                              | server caller                          | EXECUTE role                    | 実行属性           | 判断                                                                                          |
| -------------------------------- | -------------------------------------- | ------------------------------- | ------------------ | --------------------------------------------------------------------------------------------- |
| `batch_rename_tags`              | `TagService`のuser-scoped client       | `authenticated`, `service_role` | `SECURITY INVOKER` | owner RLSと`p_user_id` guardで更新する                                                        |
| `batch_reorder_tags_hierarchy`   | `TagService`のuser-scoped client       | `authenticated`, `service_role` | `SECURITY INVOKER` | owner RLS、`p_user_id` guard、tag parent owner triggerで更新する                              |
| `rename_tag_group`               | `TagService`のuser-scoped client       | `authenticated`, `service_role` | `SECURITY INVOKER` | owner RLSと`p_user_id` guardで更新する                                                        |
| `confirm_day_plans_to_records`   | `PlanService`のuser-scoped client      | `authenticated`, `service_role` | `SECURITY INVOKER` | owner RLSと`p_user_id` guardでPlanをRecordへ確定する                                          |
| `count_unused_recovery_codes`    | `RecoveryService`のuser-scoped client  | `authenticated`, `service_role` | `SECURITY INVOKER` | owner RLSと`p_user_id` guardで件数だけ返す                                                    |
| `update_personalization`         | user-scoped client                     | `authenticated`, `service_role` | `SECURITY INVOKER` | owner RLSと`p_user_id` guardで設定を更新する                                                  |
| `soft_delete_plan`               | `PlanService`のuser-scoped client      | `authenticated`, `service_role` | `SECURITY INVOKER` | owner RLSと`p_user_id` guardで論理削除する                                                    |
| `soft_delete_record`             | `RecordService`のuser-scoped client    | `authenticated`, `service_role` | `SECURITY INVOKER` | owner RLSと`p_user_id` guardを使い、`auto_migrated`を常に拒否する                             |
| `merge_tags(uuid, uuid[], uuid)` | callerなし                             | なし                            | DROP               | Productionだけに残った旧table参照overloadを`CASCADE`なしで削除する                            |
| `merge_tags_with_hierarchy`      | `TagService`のservice-role client      | `service_role`                  | `SECURITY DEFINER` | deleted Plan/Recordを含む関連更新が必要。service-role JWTを確認し、全更新を`p_user_id`で絞る  |
| `restore_plan`                   | `PlanService`のservice-role client     | `service_role`                  | `SECURITY DEFINER` | authenticated SELECTから隠れたdeleted rowを復元するためdefinerを維持する                      |
| `restore_record`                 | `RecordService`のservice-role client   | `service_role`                  | `SECURITY DEFINER` | deleted row復元のためdefinerを維持し、`auto_migrated`を常に拒否する                           |
| `use_recovery_code`              | `RecoveryService`のservice-role client | `service_role`                  | `SECURITY DEFINER` | recovery codeにauthenticated UPDATE policyを追加せず、service-role JWTと`p_user_id`で消費する |

全対象で`PUBLIC`と`anon`の`EXECUTE`を明示的にREVOKEする。service-role-onlyの4 RPCは
`authenticated`もREVOKEし、`search_path = ''`と完全修飾したrelation名を必須とする。
protected routerは入力からuser IDを受けず、`ctx.userId`だけをserviceへ渡す。

## soft-delete時のRLS境界

PlanとRecordの通常SELECTは`deleted_at IS NULL`を維持する。invoker RPCが更新した直後の行にも
SELECT policyが評価されるため、`soft_delete_plan`と`soft_delete_record`はtransaction-localな
`dayopt.soft_delete_user_id`を設定する。SELECT policyはこの値がrow ownerと一致する同一RPC
transaction内だけdeleted rowを許可する。PostgRESTの通常SELECTや次のtransactionには値が残らず、
deleted rowはauthenticated clientへ露出しない。

## tag hierarchy

migration適用前にcross-user parentを検査し、1件でもあれば自動修復せず失敗させる。
`check_tag_hierarchy()`はINSERTとUPDATEの両方で、parentとchildの`user_id`をNULL安全に比較する。
RPC、直接table操作、service-role操作のすべてに同じ制約を適用する。

## 検証

- LocalとPR PreviewでSecurity Advisorの該当WARNが0件
- 8 invoker RPCのowner成功とcross-user拒否
- 4 definer RPCのauthenticated `42501`とservice-role成功
- `auto_migrated` Recordのdelete/restore拒否
- foreign parentのRPC、直接INSERT、直接UPDATE拒否
- [RLS snapshot](../engineering/data/db/rls-snapshot.md)のdrift check
