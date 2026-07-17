---
status: current
last_verified: 2026-07-16
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
    ci.yml                    # lint + typecheck + unit + build + Playwright E2E
    docs-guard.yml            # docs整合性チェック
    integration.yml           # Supabase 統合テスト（パスフィルター）
    create-release.yml        # GitHub Release 作成
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

OWASP準拠のセキュリティ監視とレポート生成システム。

**関連Issue**: [#487 - OWASP準拠のセキュリティ強化](https://github.com/Dayopt/dayopt/issues/487)

## セキュリティレポート

### 自動生成

週次で自動的にセキュリティレポートが生成される。

**スケジュール**: 毎週月曜日 0:00 UTC（日本時間 9:00）

**生成内容**:

1. 依存関係の脆弱性スキャン（npm audit）
2. セキュリティヘッダー検証
3. OWASP Top 10チェックリスト
4. CSP違反レポート
5. レート制限統計
6. 監査ログサマリー
7. 推奨アクション

### 手動実行

```bash
# セキュリティレポート生成
npm run security:report

# レポートファイル: reports/security/security-report-YYYY-MM-DD.md
```

### GitHub Actions（セキュリティレポート）

```bash
# 手動でワークフローをトリガー
gh workflow run security-report.yml
```

**レポート保存先**:

- Artifacts: 90日間保存
- GitHub Issue: 自動的にサマリーをIssue化

## 監査ログ（Audit Logging）

### 記録されるイベント

#### 認証関連

- `LOGIN_SUCCESS` - ログイン成功
- `LOGIN_FAILURE` - ログイン失敗
- `LOGOUT` - ログアウト
- `PASSWORD_CHANGE` - パスワード変更
- `PASSWORD_RESET_REQUEST` - パスワードリセット要求
- `PASSWORD_RESET_COMPLETE` - パスワードリセット完了
- `MFA_ENABLED` - MFA有効化
- `MFA_DISABLED` - MFA無効化

#### 権限・アクセス制御

- `PERMISSION_ESCALATION` - 権限昇格
- `UNAUTHORIZED_ACCESS_ATTEMPT` - 不正アクセス試行
- `ROLE_CHANGE` - ロール変更

#### データアクセス

- `SENSITIVE_DATA_ACCESS` - 機密データアクセス
- `BULK_DATA_EXPORT` - 一括データエクスポート
- `DATA_DELETION` - データ削除

#### セキュリティイベント

- `RATE_LIMIT_EXCEEDED` - レート制限超過
- `SUSPICIOUS_ACTIVITY` - 不審なアクティビティ
- `CSP_VIOLATION` - CSP違反
- `CSRF_TOKEN_MISMATCH` - CSRFトークン不一致

### 使用例（監査ログ）

```typescript
import {
  logAuditEvent,
  logLoginSuccess,
  logLoginFailure,
  logUnauthorizedAccess,
  AuditEventType,
  AuditSeverity,
} from '@/lib/audit/logger';

// ログイン成功
await logLoginSuccess(user.id, request.headers.get('x-forwarded-for'));

// ログイン失敗
await logLoginFailure(email, 'Invalid password', request.headers.get('x-forwarded-for'));

// 不正アクセス試行
await logUnauthorizedAccess('/api/admin', userId, request.headers.get('x-forwarded-for'));

// カスタムイベント
await logAuditEvent(AuditEventType.SENSITIVE_DATA_ACCESS, AuditSeverity.INFO, {
  userId: user.id,
  resource: '/api/users/export',
  action: 'EXPORT',
  metadata: { recordCount: 1000 },
  success: true,
});
```

### データベース構造（監査ログ）

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  session_id TEXT,
  ip_address INET,
  user_agent TEXT,
  resource TEXT,
  action TEXT,
  metadata JSONB,
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**インデックス**:

- `idx_audit_logs_timestamp` - タイムスタンプ降順
- `idx_audit_logs_user_id` - ユーザーID
- `idx_audit_logs_event_type` - イベント種別
- `idx_audit_logs_severity` - 重要度
- `idx_audit_logs_ip_address` - IPアドレス

**保持期間**: 90日（自動削除）

## レート制限統計

### Upstash Redis（Phase 3）

**現在の状態**: 参照実装済み（デプロイ待ち）

**セットアップ手順**:

1. **Upstashアカウント作成**
   - https://console.upstash.com/

2. **Redisデータベース作成**
   - Region: Tokyo（推奨）
   - Type: Regional

3. **環境変数設定**

   ```env
   UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
   UPSTASH_REDIS_REST_TOKEN=op://Dayopt-Staging/upstash/UPSTASH_REDIS_REST_TOKEN
   ```

4. **パッケージインストール**

   ```bash
   npm install @upstash/ratelimit @upstash/redis
   ```

5. **実装有効化**
   - `src/lib/rate-limit/upstash.ts` のコメント解除
   - 既存のインメモリ実装を置換

**コスト見積もり**:

- 無料枠: 10,000リクエスト/日
- Dayopt想定: 3,000,000リクエスト/月
- 月額コスト: **約$6**

## CSP違反モニタリング

ProductのCSPは`apps/product/src/proxy.ts`で強制し、違反は`/api/csp-report`へ送る。report endpointは公開入力境界として次を適用する。

- JSON bodyは16 KiBを上限とし、Zod schemaに合わないreportを400、上限超過を413で拒否する
- ProductionではSHA-256化したIP単位20/分と全体120/分のUpstash rate limitを適用し、超過時は429、backend unavailable時はbodyを読まず503を返す
- `application/csp-report`以外とProduct origin以外のdocument URIを拒否し、未知のdirectiveは`unknown`へ固定する
- document / blocked / source URLからqueryとfragmentを除去し、ブラウザ拡張由来の違反はSentryへ送らない
- 有効な違反だけを`csp-violation`として、directive単位の固定fingerprintでSentryへ送る

### 違反レポート確認

Sentry Issuesで`type:csp-violation`を指定し、directive、正規化済みblocked URI、releaseを確認する。生のURL queryやreport bodyをissue、docs、chatへ転記しない。

## セキュリティメトリクス

### 成功基準（KPI）

- HSTSとCSP enforcementがproduction responseに付くこと
- `/api/csp-report`のinvalid / oversized / rate-limited inputがSentry quotaを消費しないこと
- npm auditとGitHub Actionsのsecurity checkが継続して成功すること
- SentryのCSP IssueにURL query、cookie、authorization、user contentが含まれないこと

### ダッシュボード（セキュリティ）

- GitHub Actions Security Audit（週次）
- npm audit結果（CI/CD統合）
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
