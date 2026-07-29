# Dayopt 不変条件カタログ

ai-review が「**あるべき検査の不在**」を判定するための正本。レビュー手順は `prompt.md`、
こちらは「何が守られているべきか」だけを持つ。

「不変」は**システムが守るべき約束**の意味で、このファイル自体は機能と一緒に育つ。
**機能を追加・変更してここの前提が変わったら、同じ PR でこのファイルを更新する。**
更新経路は 3 つ:

1. 実装側 — security skill（Dayopt 固有ルール 4）が、前提を作った PR での更新を義務付ける
2. レビュアー側 — prompt.md が、カタログに無い新しい前提を見つけたら summary で追記を
   提案するよう指示している。危険クラスの PR は全部レビュアーが読むため、抜けに最初に
   気づける立場にいる
3. 月次ガーデニング — unique catch の棚卸しと同じタイミングで鮮度を見る

なお、このカタログの**削除・緩和**を含む PR は人間が diff で直接確認する
（レビュアーは自分の判定基準の変更を自分では警告できない）。

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

## MCP の DB 書き込み境界

- MCP mutation の global gate は DB 上で既定 `OFF`、`enabled_client_ids` は既定 `[]`。
  両方が許可した client だけがwrite grant/applyを通る。各gateはrevision付きの
  service-role-only RPC以外から変更しない
- Candidate 1では `global OFF AND client list empty` をProductionの停止条件とする。
  旧UI direct UPDATE、tag mergeのlock順、legacy confirm-dayとdirect Recordのraceは、
  Stage 2のapp command移行と競合testが終わるまでMCP writeから到達不能にする
- MCP apply RPC は `service_role` だけが実行できる。各 apply transaction 内で user、
  connection、access token、DB-owned environment/resource、scope、期限、
  connection/token の失効状態を共通writer fence内で再検証する
- OAuth authorityのresourceは変更不可のDB environment identityへFKで結ぶ。PR Previewは
  data-less DBでexact Vercel URLとSupabase project ref/JWT refをservice-role RPCから
  一度だけ設定し、Persistent Staging identityは作らない
- Plan / Record writerはtransaction内で一人のuserとlock modeへbindする。direct DMLと
  typed commandを同じ境界へ入れ、sharedからexclusiveへのlock upgradeを即時拒否する。
  user revisionはcommitしたtransactionごとに最大1回進み、rollbackでは進まない
- mutation 本体とimmutable receiptは同じtransactionで確定し、失敗時はどちらも残さない。
  receiptはDB-authored user-data generationに結び、削除世代を越えたreplayを拒否する
- Plan / Record の同一lane重複は、通常UIのdirect DMLとMCP applyの両方に効く
  PostgreSQL exclusion constraintを最終authorityとする

## 時刻

- 保存は UTC。表示と日境界の判定はユーザーの timezone で行う
- 過去の記録ブロックの編集は temporal-constraints の制約に従い、回避経路を作らない
