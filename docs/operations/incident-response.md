---
status: current
last_verified: 2026-07-02
---

# インシデント対応プレイブック

> **パニックしない。チェックリストに従う。**
> 一人で全部やる必要はない。まず影響を止めて、それから原因を探す。

**Sentryアラート設定**: [Docs/Guides/SentryAlerts](../quality/sentry-alerts.md) |
**Sentry統合ガイド**: [Docs/Guides/Sentry](../quality/sentry.md) |
**パフォーマンス監視**: [Docs/Guides/Performance](../quality/performance.md)

---

## インシデントレベル定義

| レベル | 定義                              | 対応目標  | 例                        |
| ------ | --------------------------------- | --------- | ------------------------- |
| **P0** | サービス全停止 / セキュリティ侵害 | 即時対応  | DB障害、不正アクセス      |
| **P1** | 主要機能が使えない                | 1時間以内 | デプロイ失敗、Webhook停止 |
| **P2** | 一部機能に影響                    | 4時間以内 | Sentryエラー急増          |
| **P3** | 軽微な不具合                      | 翌営業日  | UIの表示崩れ              |

---

## 共通初動チェックリスト

すべてのインシデントで最初にやること:

- [ ] `/api/health` のレスポンス確認（200 / 503 / タイムアウト）
- [ ] Sentry Issues を開き、直近のエラー急増を確認
- [ ] 直近のデプロイ有無を確認（Vercel Dashboard / `git log --oneline -5`）
- [ ] 影響範囲を判断 → P0/P1なら次の「メンテナンスモード判断」へ

### メンテナンスモード有効化

P0またはP1で復旧に時間がかかる場合:

```bash
# Vercel環境変数を設定（即時反映）
# Vercel Dashboard → Settings → Environment Variables
NEXT_PUBLIC_MAINTENANCE_MODE=true
```

- `src/proxy.ts` がフラグを検知し、全リクエストを `/maintenance` にリダイレクト
- `/maintenance` は静的HTML（503 + Retry-After: 3600）を返す
- 復旧後は `NEXT_PUBLIC_MAINTENANCE_MODE=false` に戻す（または削除）

### 重要ダッシュボードURL

| ダッシュボード  | URL                                       |
| --------------- | ----------------------------------------- |
| Vercel          | https://vercel.com/dashboard              |
| Sentry          | https://sentry.io（プロジェクト: dayopt） |
| Supabase        | https://supabase.com/dashboard            |
| Stripe          | https://dashboard.stripe.com              |
| Supabase Status | https://status.supabase.com               |

---

## Playbook 1: Supabase障害（P0）

### 検知

- [ ] Sentry: `tags.errorCategory:DB` のエラー急増
- [ ] `/api/health` → 503（`checks.database: "error"`）
- [ ] https://status.supabase.com に障害報告あり

### 初動

- [ ] Status Page確認 → Supabase側障害なら **ケースA** へ
- [ ] Status Page正常 → 環境変数チェック → **ケースB** or **ケースC** へ
- [ ] P0判断 → メンテナンスモード有効化を検討

### 復旧

#### ケースA: Supabase外部障害

- [ ] https://status.supabase.com を継続監視
- [ ] メンテナンスモード有効化
- [ ] Status Pageの復旧通知を待つ
- [ ] 復旧後: `/api/health` で `checks.database: "ok"` を確認
- [ ] メンテナンスモード解除

#### ケースB: 環境変数ミス

- [ ] Vercel Dashboard → Settings → Environment Variables を確認
- [ ] `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` が設定済みか
- [ ] サーバー側: `SUPABASE_SERVICE_ROLE_KEY` が設定済みか
- [ ] 修正後: 再デプロイ（Vercel Dashboard → Deployments → Redeploy）

#### ケースC: Edge Functions障害

- [ ] Supabase Dashboard → Edge Functions → ログ確認
- [ ] 再デプロイ:

```bash
# IMPORTANT: --use-api 必須（この環境にDockerがない）
supabase functions deploy --use-api
```

- [ ] デプロイ後: Edge Functionsのログで正常動作を確認

### 振り返り

- [ ] 根本原因を記録
- [ ] 影響時間（検知〜復旧）を記録
- [ ] 再発防止策を検討（アラート閾値調整等）

---

## Playbook 2: Vercelデプロイ失敗（P1）

### 検知

- [ ] GitHub Actions / Vercel Dashboardでデプロイ失敗通知
- [ ] 本番サイトが古いバージョンのまま（新機能が反映されない）

### 初動

- [ ] Vercel Dashboard → Deployments → 失敗デプロイのログを開く
- [ ] 失敗フェーズを特定: lint / typecheck / build のどれか

### 復旧

#### ケースA: CI失敗（lint / typecheck）

- [ ] エラーメッセージを確認
- [ ] ローカルで再現:

```bash
npm run typecheck    # 型エラー
npm run lint         # lintエラー
npm run lint:boundaries  # feature境界違反
```

- [ ] 修正 → push → 自動デプロイ

#### ケースB: ビルドエラー

- [ ] Vercelビルドログでエラー箇所を特定
- [ ] よくある原因:
  - 環境変数の追加忘れ（`src/env.ts` の Zod バリデーション失敗）
  - 依存パッケージのバージョン不整合
  - Next.js App Router の規約違反
- [ ] `.env.example` と Vercel環境変数を照合
- [ ] 修正 → push → 自動デプロイ

#### ケースC: 緊急ロールバック（本番が壊れている場合）

- [ ] Vercel Dashboard → Deployments
- [ ] 正常に動作していた直前のデプロイを見つける
- [ ] **"..." → "Promote to Production"** で2クリックロールバック
- [ ] ロールバック後: 本番サイトで動作確認
- [ ] 落ち着いて原因調査 → 修正 → 再デプロイ

### 振り返り

- [ ] pre-commitフック（typecheck/lint）がスキップされていなかったか
- [ ] `.env.example` に新しい環境変数が追加されているか
- [ ] ビルドエラーの場合: ローカルで `npm run build` を実行してから push するフローに

---

## Playbook 3: Stripe Webhook停止（P1）

### 検知

- [ ] Stripe Dashboard → Webhooks → エンドポイントに失敗マーク
- [ ] Sentry: `tags.source:stripe_webhook` のエラー
- [ ] Slack課金通知チャンネルに通知が来なくなった

### 初動

- [ ] Stripe Dashboard → Webhooks → エンドポイント詳細を開く
- [ ] 失敗イベントのHTTPステータスコードを確認:
  - **401** → 署名検証失敗 → **ケースA**
  - **500** → 処理エラー → **ケースB**
  - **Timeout** → `maxDuration=30` 超過 → **ケースB**

### 復旧

#### ケースA: STRIPE_WEBHOOK_SECRET 不一致

- [ ] Stripe Dashboard → Webhooks → エンドポイント → Signing secret をコピー
- [ ] Vercel Dashboard → Environment Variables → `STRIPE_WEBHOOK_SECRET` を更新
- [ ] 再デプロイ（Vercel Dashboard → Deployments → Redeploy）
- [ ] Stripe Dashboard → 失敗イベントの「Resend」で確認

#### ケースB: 処理エラー（500 / Timeout）

- [ ] Sentry → Issues → `tags.source:stripe_webhook` でフィルタ
- [ ] エラー詳細とスタックトレースを確認
- [ ] `src/app/api/webhooks/stripe/route.ts` のイベントハンドラを確認
- [ ] 処理対象イベント: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
- [ ] 修正 → push → 自動デプロイ
- [ ] Stripe Dashboard → 失敗イベントの「Resend」

### 失敗イベントの再送

冪等性ガード実装済み（`stripe_webhook_events` テーブル、23505 unique_violation で重複スキップ）のため、安全に再送可能:

- [ ] Stripe Dashboard → Webhooks → 失敗イベント一覧
- [ ] 各イベントの「Resend」ボタンで再送
- [ ] 正常処理されたことをログで確認

### 振り返り

- [ ] 未処理のまま放置されたユーザーがいないか確認（Supabase → `subscriptions` テーブル）
- [ ] 全失敗イベントの再送が完了したか確認
- [ ] Webhook Secret のローテーション手順を確認

---

## Playbook 4: Sentryエラー急増（P2）

### 検知

- [ ] Sentryアラート: 1時間に50件超のエラー
- [ ] Sentry Dashboard → Issues → 直近1時間でソート

### トリアージ

エラーカテゴリで優先度を判断（`src/platform/sentry/integration.ts` のカテゴリ定義）:

| カテゴリ       | Sentryタグ                 | 優先度          | アクション             |
| -------------- | -------------------------- | --------------- | ---------------------- |
| **DB**         | `errorCategory:DB`         | P0 → Playbook 1 | 即時対応               |
| **AUTH**       | `errorCategory:AUTH`       | P1              | 認証系を確認           |
| **SYSTEM**     | `errorCategory:SYSTEM`     | P1              | インフラ確認           |
| **EXTERNAL**   | `errorCategory:EXTERNAL`   | P2              | 外部サービス障害を待機 |
| **BIZ**        | `errorCategory:BIZ`        | P3              | 通常バグ修正           |
| **VALIDATION** | `errorCategory:VALIDATION` | P3              | 入力バリデーション改善 |
| **RATE**       | `errorCategory:RATE`       | P3              | レート制限調整         |

### 復旧

#### ケースA: リグレッション（直近デプロイが原因）

- [ ] `git log --oneline -10` で直近の変更を確認
- [ ] エラー発生時刻とデプロイ時刻が一致するか
- [ ] 一致 → Vercel Dashboard でロールバック（Playbook 2 ケースC参照）
- [ ] ロールバック後: Sentryでエラーが止まったか確認

#### ケースB: 外部サービス障害

- [ ] エラーの `errorCategory` が `EXTERNAL` か確認
- [ ] 該当サービスのStatus Pageを確認
- [ ] 復旧を待機（メンテナンスモードは不要な場合が多い）
- [ ] 復旧後: Sentryでエラーが止まったか確認

#### ケースC: 未知のエラー

- [ ] Sentryでエラー詳細・スタックトレースを確認
- [ ] 影響ユーザー数を確認（Sentry → Issue → Users Affected）
- [ ] 影響が大きい場合: メンテナンスモード検討
- [ ] 原因調査 → 修正 → デプロイ

### Sentryクォータ保護

大量エラー時にクォータを消費しすぎないよう:

- [ ] Sentry Dashboard → Settings → Rate Limits が設定されているか確認
- [ ] 必要に応じて一時的にRate Limitを引き下げる

### 振り返り

- [ ] エラーをResolve済みにする
- [ ] アラート閾値の調整が必要か検討
- [ ] リグレッションの場合: typecheck/lintで検知できなかった理由を調査

---

## Playbook 5: 不正アクセス検知（P0）

### 検知

- [ ] Sentry: `type:csp-violation` の急増
- [ ] Sentry: `errorCategory:AUTH` の急増（認証失敗の連続）
- [ ] Supabase Dashboard → Authentication → Logs に不審なアクティビティ

### 初動: まず止める

- [ ] **即時**: メンテナンスモード有効化（`NEXT_PUBLIC_MAINTENANCE_MODE=true`）
- [ ] 影響範囲を把握:
  - [ ] Sentry → 影響ユーザーID一覧
  - [ ] Supabase → Auth Logs → 不審なIPアドレス / ユーザー
- [ ] 不審アカウントの無効化: Supabase Dashboard → Authentication → Users → Ban User

### 復旧

#### ケースA: CSP違反 / XSS疑い

- [ ] Sentry → CSP違反レポートの `blocked-uri` を確認
- [ ] 自サイトのスクリプトか、外部注入か判別
- [ ] 外部注入の場合:
  - [ ] `next.config.ts` のCSPヘッダーを確認・強化
  - [ ] 注入経路を特定（ユーザー入力のサニタイズ漏れ等）
  - [ ] 修正 → デプロイ
- [ ] ブラウザ拡張由来の誤検知の場合: アラート閾値調整のみ

#### ケースB: 認証バイパス

- [ ] Supabase Dashboard → Authentication → Logs
- [ ] 不正なセッション / トークンの有無を確認
- [ ] Supabase → SQL Editor:

```sql
-- 不審なセッションを確認
SELECT * FROM auth.sessions
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;
```

- [ ] 不審なセッションを無効化
- [ ] RLSポリシーの確認（意図しないデータアクセスがないか）
- [ ] 修正 → デプロイ

#### ケースC: ブルートフォース

- [ ] Supabase Auth Logs → 同一IP / メールアドレスからの大量失敗
- [ ] Supabase Dashboard → Authentication → Rate Limits の確認
- [ ] 必要に応じてレート制限を強化
- [ ] メンテナンスモード解除

### 事後対応

- [ ] 影響ユーザーへの通知（該当する場合）
- [ ] 関連ログを保存（Sentry / Supabase / Vercel）
- [ ] セキュリティパッチの適用
- [ ] パスワードリセットの強制（認証侵害の場合）

---

## 事後レビュー

### ポストモーテムテンプレート

すべてのP0/P1インシデント後に記録する:

```markdown
## ポストモーテム: [インシデント名]

**日時**: YYYY-MM-DD HH:MM〜HH:MM（JST）
**レベル**: P0 / P1
**影響**: [影響ユーザー数 / 影響機能]

### タイムライン

| 時刻  | イベント                                 |
| ----- | ---------------------------------------- |
| HH:MM | 検知（Sentryアラート / 手動発見）        |
| HH:MM | 初動開始                                 |
| HH:MM | メンテナンスモード有効化（該当する場合） |
| HH:MM | 原因特定                                 |
| HH:MM | 修正デプロイ / ロールバック              |
| HH:MM | 復旧確認                                 |
| HH:MM | メンテナンスモード解除                   |

### 根本原因

[根本原因の説明]

### 再発防止策

- [ ] [アクション1]
- [ ] [アクション2]

### 学び

[このインシデントから得られた教訓]
```

### 月次メンテナンスチェックリスト

毎月1回、以下を確認:

- [ ] Sentry: 未解決Issueの棚卸し（Resolve / Ignore の判断）
- [ ] Sentry: アラート閾値の妥当性確認（誤検知が多すぎないか）
- [ ] Sentry: Rate Limits設定の確認
- [ ] Stripe: Webhookエンドポイントの成功率確認
- [ ] Supabase: Edge Functionsのエラーログ確認
- [ ] Vercel: ビルド時間のトレンド確認（異常な増加がないか）
- [ ] 環境変数: `.env.example` と本番/ステージングの差分確認
- [ ] 依存パッケージ: `npm audit` でセキュリティ脆弱性チェック

---

## 関連ドキュメント

- **Sentry統合ガイド**: [Docs/Guides/Sentry](../quality/sentry.md)
- **Sentryアラート設定**: [Docs/Guides/SentryAlerts](../quality/sentry-alerts.md)
- **パフォーマンス監視**: [Docs/Guides/Performance](../quality/performance.md)
- **マイグレーションロールバック**: `docs/guides/migration-rollback.md`
- **ヘルスチェック実装**: `src/app/api/health/route.ts`
- **Stripe Webhook実装**: `src/app/api/webhooks/stripe/route.ts`
- **エラーカテゴリ定義**: `src/platform/sentry/integration.ts`
- **メンテナンスページ**: `src/app/maintenance/route.ts`

---

**最終更新**: 2026-03-19 | **バージョン**: v1.0
