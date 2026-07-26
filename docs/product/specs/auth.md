---
status: current
last_verified: 2026-07-26
code:
  - apps/product/src/features/auth
  - apps/product/src/features/external-calendar/server/account-deletion.ts
  - apps/product/src/lib/mcp/trpc-bridge.ts
  - apps/product/src/lib/trpc
public_docs:
  - account-troubleshooting
lp: []
---

# Auth（認証）

Supabase Auth ベースの認証機能。

## 現在の振る舞い

- Supabase Auth によるセッション管理（メール/パスワード、MFA検証フローを含む）
- `protectedProcedure` で保護された tRPC procedure が `ctx.userId` でデータアクセスを制限する
- MFA登録済みで session assurance level が `aal1` のブラウザセッションは、画面遷移だけでなく tRPC API 側でも protected procedure を拒否する
- RLS（Row Level Security）によるDBレベルでの認可を併用する

## アカウント削除

`user.deleteAccount` はパスワード再認証の後、次の順序で処理する。

1. Calendar account-deletion intentを開始し、DBが返すcanonical deletion IDを採用する
2. 各connection / revoke outbox itemをprepareする
3. DBのprovider start markerが`started`を返した場合だけGoogle revokeを1回呼ぶ
4. 同じoperation・lease・outcomeでfinalizeし、全itemのdurable receiptをsealする
5. avatarを削除する
6. Stripe subscriptionとCustomerをidempotency key付きで削除する
7. `auth.users`を最後に削除する

provider startの応答が不明な場合はGoogleを再実行しない。finalizeの応答が不明な場合は同じ引数のfinalizerだけを再送する。Calendar sealに失敗した場合はStorage、Stripe、Authを変更しない。StorageまたはStripeの失敗時はAuth identityを残し、完了済みの削除を冪等に再確認できる。

「すべてのデータを削除」はaccountを保持し、Calendar authorityとoperation IDにbindした`delete_all_user_data_command_v5`を使う。確認ダイアログを開く前にDBがoperation IDと現在のuser generationを発行し、同じダイアログ内のclient retry、tRPC retry、DB retryで両方を固定する。user generationを進め、Calendar tokenをrevoke outboxへ移し、Dayopt OAuthを失効し、MCP mutation receiptをpurged generationへ固定してから、Plan、Record、report、tag、user settings、Calendar mirrorを原子的に削除する。応答が失われても同じoperation IDを再送し、完了済みなら新しく作成されたデータを削除せず成功を返す。別の操作や古いgenerationは拒否する。

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
