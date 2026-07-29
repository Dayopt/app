---
status: current
last_verified: 2026-07-30
code:
  - apps/product/src/app/api/trpc/_server/_composition/account-deletion-selector.ts
  - apps/product/src/app/api/trpc/_server/_composition/account-deletion-coordinator.ts
  - apps/product/src/features/auth/server/user-service.ts
  - apps/product/src/features/external-calendar/server/account-deletion.ts
  - apps/product/src/features/settings/server/account-deletion.ts
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
- 削除の通知メールは auth.users の削除が今回確定した後に送る。送信失敗では削除結果を戻さない
- ログイン画面の「パスワードを忘れた」から Google ユーザーがリセットするとパスワードが新規設定される（Supabase の仕様）。サーバー側ではブロックせず、リセット画面の案内文で誘導する

## アカウント削除

Candidate 3は、新旧アプリが同時に動く期間の互換selectorを置く。DBのterminal markerが無い場合、またはaccount deletion gateが無効で進行中の削除が0件の場合は、従来のavatar、Stripe、Auth削除を使う。markerやgateの状態を確認できない場合は削除を止める。

gateを有効にした後は、同じユーザーの操作をDB内で直列化し、次の順で進める。

1. Billingの対象を固定し、open Checkout Sessionを失効する
2. Google Calendar tokenを失効し、結果をDBへ記録する
3. `avatars`と`attachments`を削除し、空になったことを確認する
4. SubscriptionとStripe Customerを削除し、結果をDBへ記録する
5. 3つの処理が完了した後にAuth identityを削除する

途中で失敗した場合はAuth identityを残す。完了済みの処理はDBの記録から再開する。別ユーザーの削除や通常操作は止めない。

このPRではgateを有効にしない。旧アプリが動いていないことと外部サービスのidentityをPreviewで確認した後、別の明示承認で有効にする。

「すべてのデータを削除」の公開入力は、従来どおり`{ confirmText: 'DELETE' }`を維持する。世代番号を使う新しいDB処理は配置するが、このPRでは画面から使わない。

## tRPC API auth policy

`/api/trpc` は middleware/proxy を通らないため、API gate 自体で認証状態を再評価する。

- Session cookie mode: Supabase Auth の `getUser()` でユーザーを検証し、MFA登録済み `aal1 -> aal2` の状態なら `FORBIDDEN` を返す
- MFA AAL 取得に失敗した session cookie mode は fail closed として `FORBIDDEN` を返す
- `user.verifyRecoveryCode` は recovery-code 検証により MFA factor を解除するため、既知の `aal1 -> aal2` 状態でも通過を許可する
- OAuth bearer mode: token を `oauth_tokens` で検証し、`client_id` と `scopes` を tRPC context に保持する
- OAuth bearer mode の汎用 tRPC 呼び出しは、procedure path ごとの allowlist と scope が一致した場合だけ許可する
- Phase 1 で OAuth bearer mode から許可する tRPC procedure は `plans.list` / `records.list` の read-only 2 本だけ。互換 MCP tool `entries.list` も同じ `read:entries` scope を使う

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
