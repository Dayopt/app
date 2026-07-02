---
status: current
last_verified: 2026-06-17
---

# 🛡️ セキュリティ監視・レポート

OWASP準拠のセキュリティ監視とレポート生成システム

**関連Issue**: [#487 - OWASP準拠のセキュリティ強化](https://github.com/Dayopt/dayopt/issues/487)

---

## 📊 セキュリティレポート

### 自動生成

週次で自動的にセキュリティレポートが生成されます。

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

### GitHub Actions

```bash
# 手動でワークフローをトリガー
gh workflow run security-report.yml
```

**レポート保存先**:

- Artifacts: 90日間保存
- GitHub Issue: 自動的にサマリーをIssue化

---

## 🔍 監査ログ（Audit Logging）

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

### 使用例

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

### データベース構造

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

---

## ⏱️ レート制限統計

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

---

## 🔒 CSP違反モニタリング

### Report-Onlyモード（Phase 1-2）

現在CSPはReport-Onlyモードで動作中。違反は記録されますが、ブロックはされません。

**CSP違反エンドポイント**: `/api/csp-report`

**モニタリング期間**: 2週間

**次のステップ**:

1. CSP違反ログを確認
2. 正当な違反に対してポリシーを調整
3. 強制モード（enforcement）に移行

### 違反レポート確認

```sql
-- Supabase: CSP違反ログ確認
SELECT
  document_uri,
  violated_directive,
  blocked_uri,
  COUNT(*) as violation_count
FROM csp_reports
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY document_uri, violated_directive, blocked_uri
ORDER BY violation_count DESC
LIMIT 20;
```

---

## 📈 セキュリティメトリクス

### 成功基準（KPI）

#### Phase 1: 基盤整備（完了）

- [x] HSTS適用率: 100%
- [x] CSP Report-Only有効化: 100%
- [x] Dependabot有効化: 完了
- [x] 週次npm audit: 自動化

#### Phase 2: 強化（完了）

- [x] CSRF保護レベル: Enterprise Grade
- [x] セッション管理: OWASP準拠
- [x] エラーハンドリング: 情報漏洩ゼロ
- [x] OWASP ZAP統合: 完了

#### Phase 3: 運用監視（進行中）

- [ ] Upstash Redisデプロイ: 待機中
- [x] 監査ログ実装: 完了
- [x] セキュリティレポート自動化: 完了
- [ ] CSP強制モード移行: 2週間後

### ダッシュボード

**現在利用可能**:

- GitHub Actions Security Audit（週次）
- npm audit結果（CI/CD統合）
- OWASP ZAP スキャン結果

**Phase 3完了後**:

- Upstash Redis Analytics
- Supabase監査ログダッシュボード
- 週次セキュリティレポートIssue

---

## 🚨 アラート

### Critical イベント

以下のイベントは即座にSentryに送信されます:

1. **不正アクセス試行**（`UNAUTHORIZED_ACCESS_ATTEMPT`）
2. **セッションハイジャック検知**（`SESSION_HIJACK_ATTEMPT`）
3. **権限昇格の異常**（`PERMISSION_ESCALATION`）
4. **CSRF攻撃検知**（`CSRF_TOKEN_MISMATCH`）

### GitHub Issue自動作成

以下の場合、自動的にGitHub Issueが作成されます:

1. **OWASP ZAP**: Critical/High脆弱性検出時
2. **npm audit**: High/Critical脆弱性検出時
3. **セキュリティレポート**: 生成失敗時

---

## 📚 関連ドキュメント

- [Error Handling](../../../apps/product/src/lib/errors/index.ts)
- [Rate Limiting](../../../apps/product/src/lib/rate-limit/upstash.ts)
- [Issue #487](https://github.com/Dayopt/dayopt/issues/487)

---

## 🔗 外部リソース

- [OWASP Top 10:2021](https://owasp.org/Top10/)
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- [Upstash Rate Limiting](https://upstash.com/docs/redis/features/ratelimiting)
- [Mozilla Observatory](https://observatory.mozilla.org/)
- [SecurityHeaders.com](https://securityheaders.com/)

---

**最終更新**: 2025-10-08 | **バージョン**: v1.0 - Phase 3完了

---

**種類**: 📙 リファレンス
**最終更新**: 2025-12-11
**所有者**: Dayopt 開発チーム
