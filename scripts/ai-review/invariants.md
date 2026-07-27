# Dayopt 不変条件カタログ

ai-review が「**あるべき検査の不在**」を判定するための正本。レビュー手順は `prompt.md`、
こちらは「何が守られているべきか」だけを持つ。**機能を追加・変更してここの前提が変わったら、
同じ PR でこのファイルを更新する**（更新を忘れると、外部レビュアーは古い前提で検査する）。

## 課金・entitlement

- 外部カレンダー連携は **Pro 限定**。OAuth の開始・callback・cron 同期の**すべての入口**で
  entitlement を検査する（2026-07 に callback の検査漏れが実際に起きたクラス）
- Pro 限定機能の server 入口は `proProcedure` を使うか、明示的に entitlement を検査する
- Stripe webhook は署名を検証し、event id で冪等化する
  （`app/api/webhooks/stripe/stripe-webhook-idempotency.ts`）

## 公開 HTTP エンドポイント

- 公開エンドポイント（OAuth callback / webhook / contact）は rate limit を持つ
- cron ルート（`app/api/cron/**`）は `CRON_SECRET` を検証する
- redirect 先はユーザー入力をそのまま使わず、`lib/safe-redirect.ts` の検証を通す

## データ分離（RLS）

- user データを持つ table は RLS 有効。標準形は
  「`Users can view own X`（`auth.uid() = user_id`）」+「service_role full access」。
  この形から外れる policy は、外れる理由が migration に書かれているべき
- `SECURITY DEFINER` 関数は `search_path` を固定し、内部で `auth.uid()` を検証する
- token・暗号化 credential の列を `authenticated` ロールに GRANT しない

## OAuth・暗号

- 外部 OAuth では `openid` scope を要求し、ユーザーの同定は id_token 側で行う
  （メールアドレスの一致で同定しない）
- token 暗号化の鍵は起動時に長さを検証する（32 bytes 以上）

## 時刻

- 保存は UTC。表示と日境界の判定はユーザーの timezone で行う
- 過去の記録ブロックの編集は temporal-constraints の制約に従い、回避経路を作らない
