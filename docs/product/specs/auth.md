---
status: current
last_verified: 2026-07-28
code:
  - apps/product/src/app/api/trpc/_server/_composition/account-deletion-coordinator.ts
  - apps/product/src/features/auth/server/user-service.ts
  - apps/product/src/features/external-calendar/server/account-deletion.ts
  - apps/product/src/features/settings/server/account-deletion.ts
  - apps/product/src/lib/mcp/trpc-bridge.ts
  - apps/product/src/lib/trpc
  - supabase/migrations/20260728110000_recover_customer_before_account_deletion.sql
public_docs:
  - account-troubleshooting
lp: []
---

# Auth（認証）

Supabase Auth ベースの認証機能。

## 現在の振る舞い

- Supabase Auth によるセッション管理（メール/パスワード、MFA検証フローを含む）
- ソーシャルログインは Google のみ。Apple（有料 Developer Program が必須）と Meta（アプリ審査コスト）は不採用（2026-07 決定、[ログ](../log/2026-07-24-social-login-google-only.md)）。本番の provider 設定は Supabase Dashboard が正本
- 認証メール（signup 確認 / パスワードリセット / メールアドレス変更）は Auth send_email hook → Edge Function `send-auth-email` → Resend で送信する。メールアドレス変更は Secure Email Change により現・新両アドレスへ確認メールを 2 通送る
- `protectedProcedure` で保護された tRPC procedure が `ctx.userId` でデータアクセスを制限する
- MFA登録済みで session assurance level が `aal1` のブラウザセッションは、画面遷移だけでなく tRPC API 側でも protected procedure を拒否する
- RLS（Row Level Security）によるDBレベルでの認可を併用する

## アカウント削除

`user.deleteAccount` は、server側で判定したログイン手段に応じた再認証の後、generic account-deletion operationを使う。gate無効中はdurable closing fenceが無いため、削除要求をfail closedにする。旧アプリをdrainし、gateを有効にした後だけ次へ進む。

1. DBのglobal・user fence下でgeneric operationを開始する。Stripe Customer作成がprovider開始後なら、期限内は待つ。23時間を過ぎた不明応答は、`supabase_user_id` metadataでexact検索し、0件ならabandon、1件ならprofileへbind、複数なら停止する
2. Billing targetをprofileからsnapshotする。設定済みのStripe account IDとlive/test modeを照合し、open Checkout Sessionを先にexpireする
3. generic operationにbindしたCalendar deletion IDを変更せず使う。各connection / revoke outbox itemをprepareし、DBのprovider start markerが`started`を返した時だけGoogle revokeを1回呼ぶ。同じoperation・lease・outcomeでfinalizeし、全itemをsealする
4. service roleで`avatars`と`attachments`を再帰列挙する。100件ずつ削除し、両bucketのuser prefixが空になったことを再確認する
5. open Checkout Sessionを再列挙してexpireし、対象statusのsubscriptionをcancelする。bound Customerを削除し、Stripeが`DeletedCustomer`を返すことを確認してBilling receiptをsealする。`resource_missing`は成功扱いしない
6. Calendar、Storage、Billingの3 stepを完了してgeneric operationをsealする
7. `auth.users`を最後に削除する。応答消失時は同じuser IDを最大3回照合・再送し、存在不明ならfail closedにする

generic operation開始後は、同じuserへの新しいCalendar、Storage、Billing、Plan、Record writeをDB fenceが拒否する。Google provider startの応答が不明な場合はGoogleを再実行しない。finalizeの応答が不明な場合は同じ引数のfinalizerだけを再送する。どのstepが失敗してもAuth identityを残し、完了済みstepはdurable receiptから再開する。

削除通知メールはAuth削除が今回確定した場合だけ送る。`user_not_found`を直接受けたreplayでは重複送信しない。完全なexactly-once配信ではなく、メール失敗で削除結果は戻さない。

「すべてのデータを削除」はaccountを保持し、Calendar authorityとoperation IDにbindした`delete_all_user_data_command_v5`を使う。確認ダイアログを開く前にDBがoperation IDと現在のuser generationを発行し、同じダイアログ内のclient retry、tRPC retry、DB retryで両方を固定する。user generationを進め、Calendar tokenをrevoke outboxへ移し、Dayopt OAuthを失効し、MCP mutation receiptをpurged generationへ固定してから、Plan、Record、report、tag、user settings、Calendar mirrorを原子的に削除する。応答が失われても同じoperation IDを再送し、完了済みなら新しく作成されたデータを削除せず成功を返す。別の操作や古いgenerationは拒否する。

## ログイン手段によるアカウント操作の分岐

Google でのみ登録したユーザーはパスワードを持たない。これを異常扱いせず、**ユーザーが実際に持っている手段で再認証する**。判定は `hasPasswordIdentity`（`lib/auth/domain/login-method.ts`）が `app_metadata.providers` から行い、UI もサーバーも同じ関数を使う。

| 操作               | パスワードあり                 | Google のみ                                          |
| ------------------ | ------------------------------ | ---------------------------------------------------- |
| ログイン方法の表示 | 出さない（自明なため）         | 「Google」を表示する                                 |
| メールアドレス変更 | 現パスワードで再認証して変更   | **変更させない**。Google 側が正本である旨を案内する  |
| パスワード変更     | 現パスワードで再認証して変更   | 項目ごと出さない                                     |
| アカウント削除     | 現パスワード + `DELETE` の入力 | MFA があれば TOTP + `DELETE`、無ければ `DELETE` のみ |

- 削除時の `requiresPassword` はクライアント申告ではなく server 側の `app_metadata` から判定する
- MFA factor の一覧を取得できない場合は fail closed で削除を止める
- 削除通知メールの locale は削除前に取得し、`auth.users` の削除確定後に送る。送信失敗では削除結果を戻さず、成功を返す
- ログイン画面の「パスワードを忘れた」から Google ユーザーがリセットするとパスワードが新規設定される（Supabase の仕様）。サーバー側ではブロックせず、リセット画面の案内文で誘導する

## tRPC API auth policy

`/api/trpc` は middleware/proxy を通らないため、API gate 自体で認証状態を再評価する。

- Session cookie mode: Supabase Auth の `getUser()` でユーザーを検証し、MFA登録済み `aal1 -> aal2` の状態なら `FORBIDDEN` を返す
- MFA AAL 取得に失敗した session cookie mode は fail closed として `FORBIDDEN` を返す
- `user.verifyRecoveryCode` は recovery-code 検証により MFA factor を解除するため、既知の `aal1 -> aal2` 状態でも通過を許可する
- Dayopt OAuth token の外部データ接続面は `/api/mcp` に限定する。公開 `/api/trpc` から同じ token で汎用 procedure を実行できない
- MCP tool は検証済みの `user_id`、`client_id`、scope を in-process tRPC bridge へ渡す。HTTP input から作れない内部 marker、procedure path ごとの allowlist、exact scope がすべて一致した場合だけ procedure を実行する
- 現在 MCP bridge から許可する read procedure は `plans.list` / `plans.getById` / `records.list` / `records.getById` / `tags.list` / `timeblockContext.getConstraints` / `statistics.getMcpReview` の7本。各procedureはexact pathに対応するscopeだけを許可し、互換 MCP tool `entries.list` は`read:entries` scopeを使う

## OAuth / MCP redirect URI policy

Dayopt の OAuth server は Phase 1 では static client allowlist を使う。`redirect_uri` は client ごとの登録済み URI と完全一致した場合だけ許可し、domain / scheme / path prefix の wildcard は使わない。

既定で許可する callback は、公開 client が固定している最小セットだけにする:

- `claude-ai`: `https://claude.ai/api/mcp/auth_callback`
- `chatgpt`: `https://chatgpt.com/connector_platform_oauth_redirect`
- `cursor`: `cursor://anysphere.cursor-mcp/oauth/callback`

ChatGPT の現在の Apps SDK / MCP app flow は app 管理画面で callback ID 付きの production redirect URL を発行する。Dayopt 側で追加許可が必要な場合は、`OAUTH_CHATGPT_REDIRECT_URIS` に完全な URI 文字列をカンマ区切りで追加する。同じ形式で Claude / Cursor も `OAUTH_CLAUDE_REDIRECT_URIS` / `OAUTH_CURSOR_REDIRECT_URIS` に追加できる。

これらの env は secret ではないが、誤って広い URI を許可すると authorization code delivery の境界が崩れる。値には `*` を含めず、client が実際に送る完全な URI だけを登録する。

## 関連する意思決定

- [Security運用](../../operations/security/environment-secrets.md)
