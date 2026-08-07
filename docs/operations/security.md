---
status: current
last_verified: 2026-07-30
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
    ci.yml                    # static + unit + Playwright E2E
    production-config-audit.yml  # Vercel environment metadata 監査
    docs-guard.yml            # secret scan（gitleaks + secrets:check、全 PR）+ docs整合性チェック
    integration.yml           # Supabase 統合テスト + RLS snapshot drift 検査
    create-release.yml        # GitHub Release 作成
    release.yml               # リリース処理
```

## 権限設計

全ワークフローで最小権限の原則を適用。`pull-requests: write` を持つワークフローは無い
（唯一持っていた `ai-review.yml` は 2026-08-03 に撤去した）。

### ワークフロー別 permissions

| ワークフロー                  | permissions                                                  | 理由                            |
| ----------------------------- | ------------------------------------------------------------ | ------------------------------- |
| `ci.yml`                      | `contents: read`                                             | コード読み取りのみ              |
| `docs-guard.yml`              | `contents: read`                                             | docs読み取りのみ                |
| `integration.yml`             | `contents: read`                                             | コード読み取りのみ              |
| `production-config-audit.yml` | `contents: read` / `pull-requests: read` / `statuses: write` | 固定 context 名での status 発行 |
| `create-release.yml`          | `contents: write`                                            | タグからリリース作成            |

`production-config-audit.yml` は `pull_request_target` で走るが、
**`pull_request_target` でも job の check run は PR の `statusCheckRollup` に出る**
（2026-07-30 に PR #1760 で実測。詳細は [infra.md §merge gate の required checks](../engineering/infra.md#merge-gate-の-required-checks)）。
それでも `statuses: write` を持つのは、job 名から独立した固定 context
（`Production Config Audit`）を ruleset の required 指定に使うため。

`contents: write` は持たない（外部 API の結果を受けて動く job に書き込み権限を与えない）。

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

どの context を required にするかは [infra.md §merge gate の required checks](../engineering/infra.md#merge-gate-の-required-checks) を正本とする。ここには複製しない（job 名を変えるたびに 2 箇所が乖離するため）。

private + Free plan では GitHub 側の required check 強制自体が効かず、マージ可否は `scripts/git/finish-branch.sh` が判定する。ruleset の実状は API から確認できない（`gh api repos/Dayopt/dayopt/rulesets` は 403 `Upgrade to GitHub Pro` を返す）ため、この画面の設定は手動確認に依存する。

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
| `VERCEL_TOKEN`                  | Vercel API 監査   | production-config-audit        |
| `VERCEL_ORG_ID`                 | Vercel team 特定  | production-config-audit        |

`GEMINI_API_KEY` は外部モデル diff レビュー（ai-review）専用だったが、2026-08-03 の撤去に
合わせて **key 自体を失効させた**。GitHub repo secret の削除に加え、Google AI Studio 側の
project と API key を削除済みで、1Password の項目もアーカイブした。**再導入する場合は
key の再発行から必要**で、既存の参照を復元する経路は残っていない。

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

| 層         | タイミング          | 実体                                                                                                                                                                                                                       |
| ---------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 実装中     | コード変更ごと      | `security` skill（OWASP 観点のガイド）/ `risk-reviewer` の自動委任（`.claude/rules/ai-behavior.md` §Read-only delegation）                                                                                                 |
| PR ごと    | CI                  | `docs-guard.yml` の secret scan（gitleaks + `secrets:check`）/ `integration.yml` の RLS snapshot drift 検査 / Vercel build の client bundle secret 検査（`verify:bundle`）/ `production-config-audit.yml` / Codex レビュー |
| 継続       | 常時・自動          | Dependabot alerts（security update は schedule と無関係に即時 PR）/ Actions の SHA 固定 / Sentry / CSP 違反モニタリング / rate limit                                                                                       |
| 定期・随時 | 月次 + オンデマンド | `/gardening` §5.7 のセキュリティ sweep（advisors + `pnpm security:check` + `/claude-security` 提案）/ `/security-review` / `/code-review`                                                                                  |

**束ねた PR のレビュー**: 複数 issue / Step を束ねた PR は merge 前に read-only subagent のクロスレビューを必須とする（`.claude/rules/workflow.md` §PR 粒度）。

## 定期検査の cadence

定期検査の正本は `/gardening` §5.7（月次セキュリティ sweep）とする。実施内容:

1. Supabase security advisors の確認（`mcp__supabase__get_advisors`、read-only）
2. `pnpm security:check`（= `pnpm audit --audit-level=moderate`）
3. `/claude-security` の全体スキャン実行をユーザーへ提案

2 は **CI では実行しない**。依存脆弱性の継続検知は Dependabot alerts が担当し（security update は schedule と無関係に即時 PR が出る）、CI に `pnpm audit` を足すと新しい advisory が公開された瞬間に無関係な PR まで落ちる。Actions 課金が PR 本数に比例する構造（`.claude/rules/workflow.md` §PR 粒度）でもあるため、月次の手動実行に留める。

secret 検出はこれとは別で、**全 PR で自動実行される**。`docs-guard.yml`（job 名 `docs & secrets guard`、path filter なし）が gitleaks で base ref からの差分を、`pnpm secrets:check` で tracked tree 全体を見る。加えて `ci.yml` がビルド後の client bundle への混入を grep する。ローカルでは `pnpm check` に `secrets:check` が含まれる（CI 側は docs-guard の 1 回のみで、二重実行はしない）。

3 は `disable-model-invocation: true` のため AI 側から起動できない。実行はユーザーが `/claude-security` を叩く。結果は `CLAUDE-SECURITY-<timestamp>/` に出力され、`.gitignore` を同梱するため誤って commit されない。

所見が出た場合は `docs/operations/log/YYYY-MM-DD-security-sweep.md` に記録し、修正が必要なものは `dispatch` skill の intake で起票する（sweep と同じセッション内で起票まで行う）。

### 前提: `claude-security` plugin

3 の深掘りスキャンは Claude Code の plugin に依存する。MCP サーバー（`.claude/rules/mcp-usage.md`）と同じく **user scope の設定に置き、repo には定義を持たない**。新しいマシン / 別プロファイルでは次を実行して導入する。

```bash
claude plugin install claude-security@claude-plugins-official
```

marketplace が見つからない場合は先に `claude plugin marketplace add anthropics/claude-plugins-official` を実行する。Python 3.9 以上が `PATH` に必要（差分スキャンと patch 生成には git checkout も要る）。

**plugin が入っていない環境でも 1・2 は実行できる**。1 は Supabase MCP、2 は repo の `package.json` script で完結するため、深掘りスキャンだけが欠ける状態になる。sweep 時に plugin が未導入なら、上記コマンドを案内した上で 1・2 を実施する。

> 2026-07-27 以前は週次自動レポート（`security-report.yml` / `npm run security:report` / `reports/security/`）を定義していたが、workflow は PR #957 で削除済みで実体が無かった。上記の月次 sweep がその後継。

## 監査ログ（Audit Logging）

アプリ側の独自監査ログテーブルは持たない。`login_attempts` / `auth_audit_logs` は Supabase Auth の `auth.audit_log` との二重管理でありアプリコードからの参照も無かったため、`20260414150000_drop_login_attempts_and_auth_audit_logs.sql` で削除済み。

現在の記録先:

| 対象                             | 記録先                                                                                                                |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 認証イベント（ログイン・失敗等） | Supabase Auth の `auth.audit_log`（Supabase 側が管理。Dashboard / Auth log で参照）                                   |
| MCP tool call                    | `public.oauth_audit_log` テーブル（`tool_name` / `called_at` を記録。**現状 production からの insert 経路は未実装**） |
| アプリ例外・セキュリティイベント | Sentry（CSP 違反は `csp-violation` として directive 単位の固定 fingerprint で送信）                                   |
| rate limit 超過                  | **専用の記録なし**（下記参照）                                                                                        |

**OAuth token のライフサイクル（発行・更新・失効）を記録するテーブルは存在しない。** `oauth_audit_log` は名前に反して MCP tool call 用のスキーマ（`supabase/schemas/017_tables_oauth.sql`）で、token 操作の記録には使えない。インシデント対応時に「記録が残っているはず」と仮定しない。

**rate limit の超過も記録されない。** `Ratelimit` は product / web とも `analytics: false` で構築しており（raw identifier を保存しないための意図的な設定）、Upstash の request metrics からは拒否されたリクエストを判別できない。

したがって認証攻撃の調査は **Supabase Auth log を主 signal とする**（[monitoring](./monitoring.md) / [runbook](./runbook.md)）。rate limit の効き具合を継続的に見たい場合は、analytics 有効化か 429 応答の計測を別途設計する必要がある。

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
- `pnpm security:check` 結果（CI では実行しない。月次 sweep で手動実行する）
- Dependabot alerts（依存脆弱性の継続検知はこちらが担当）/ Supabase security advisors
- Upstash Redis request / latency / error metrics（Ratelimit Analyticsとraw identifier保存は無効）
- Sentry Issues / quota / discarded event

## アラート（セキュリティ）

Sentryの高優先度Issue通知はemailを正規channelとする。認証失敗やvalidation errorなどのexpected errorはIssue化せず、認証攻撃の調査はSupabase Auth logを主signalとする（rate limit analyticsは無効のため使えない。§監査ログ 参照）。閾値と対応手順は[monitoring](./monitoring.md)と[runbook](./runbook.md)を正とする。

## 関連ドキュメント（セキュリティ監視）

- [Error Handling](../../apps/product/src/lib/trpc/errors.ts)
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
