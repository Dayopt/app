---
status: current
last_verified: 2026-08-11
code:
  - apps/product/src/features/settings/components/EmailChangeDialog.tsx
  - apps/product/src/features/settings/components/PasswordChangeDialog.tsx
  - apps/product/src/app/[locale]/(auth)/auth/confirm/route.ts
  - apps/product/src/app/[locale]/(auth)/auth/confirmed/page.tsx
  - apps/product/src/lib/trpc/session-auth-context.ts
  - apps/product/src/lib/trpc/procedures.ts
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
- MFA登録済みで session assurance level が `aal1` のブラウザセッションは、画面遷移だけでなく HTTP / RSC の両 tRPC context でも protected procedure を拒否する
- RLS（Row Level Security）によるDBレベルでの認可を併用する

## ログイン手段によるアカウント操作の分岐

Google でのみ登録したユーザーはパスワードを持たない。これを異常扱いせず、**ユーザーが実際に持っている手段で再認証する**。判定は `hasPasswordIdentity`（`lib/auth/domain/login-method.ts`）が `app_metadata.providers` から行い、UI もサーバーも同じ関数を使う。

| 操作               | パスワードあり                 | Google のみ                                          |
| ------------------ | ------------------------------ | ---------------------------------------------------- |
| ログイン方法の表示 | 出さない（自明なため）         | 「Google」を表示する                                 |
| メールアドレス変更 | Secure Email Change で確認     | **変更させない**。Google 側が正本である旨を案内する  |
| パスワード変更     | 現パスワードをサーバー側で検証 | 項目ごと出さない                                     |
| アカウント削除     | 現パスワード + `DELETE` の入力 | MFA があれば TOTP + `DELETE`、無ければ `DELETE` のみ |

- 削除時の `requiresPassword` はクライアント申告ではなく server 側の `app_metadata` から判定する
- MFA factor の一覧を取得できない場合は fail closed で削除を止める
- 削除の通知メールは auth.users の削除が今回確定した後に送る。送信失敗では削除結果を戻さない
- ログイン画面の「パスワードを忘れた」から Google ユーザーがリセットするとパスワードが新規設定される（Supabase の仕様）。サーバー側ではブロックせず、リセット画面の案内文で誘導する

## 設定画面の本人確認と保証境界

設定画面のメールアドレス変更・パスワード変更は、公開 Auth endpoint での再認証（`signInWithPassword`）を行わない。Bot Protection が有効な production では CAPTCHA token を要求されて必ず失敗するため（[#1917](https://github.com/Dayopt/dayopt/issues/1917)）。本人確認は Supabase Auth 側の専用機構に委ねる。

| 操作               | 本人確認の担い手                                         | 依存する production 設定                            | 設定が崩れた時の向き |
| ------------------ | -------------------------------------------------------- | --------------------------------------------------- | -------------------- |
| メールアドレス変更 | Secure Email Change（旧・新双方への確認メール）          | `mailer_secure_email_change_enabled`                | **fail-open**        |
| パスワード変更     | `updateUser({ password, current_password })` の検証      | `security_update_password_require_current_password` | **fail-open**        |
| アカウント削除     | service-role 経由の `signInWithPassword`（captcha 免除） | `SUPABASE_SERVICE_ROLE_KEY` が **legacy JWT 形式**  | **fail-closed**      |

**故障の向きが逆のものが同じ表に並んでいる。** 上 2 行は設定が false になると**本人確認が黙って消える**（fail-open）。削除行は依存が崩れると**削除が黙ってできなくなる**（fail-closed）。監視を設計する時に「値が false になったら警報」の一方向だけで組むと、削除経路の故障を永久に検出できない（[#1926](https://github.com/Dayopt/dayopt/issues/1926)）。

**service role key を回転する、または新形式（`sb_secret_`）へ移行する場合、この経路の再検証を先に行う。** 新形式は Bearer として送られないため admin と解釈されず、captcha 免除が成立しなくなって削除が止まる。Supabase の legacy JWT key 廃止は外部の都合で動き、アプリ側の canary は**事後にしか鳴らない**。検証はローカルで `supabase/config.toml` の `[auth.captcha]` を有効化し、user-scoped 経路が失敗し service-role 経路が成功することを確認する。

この再検証は人間の手順だけに委ねず、**production build gate が鍵の形式を機械的に検査する**（`apps/product/production-build-gate.mjs`、[#1952](https://github.com/Dayopt/dayopt/issues/1952)）。legacy JWT 形式でない値が入った production build は失敗し、error message が削除フローへの影響と対処（Turnstile 方式への切替 = [#1925](https://github.com/Dayopt/dayopt/issues/1925) の (c) 案）を示す。日次 audit ではなく build gate に置いたのは、`production-auth-config-audit.mjs` の cron job に service role key を配ると RLS 全バイパスの鍵の配布先が増えるため（build env には値が既にあり、新たな配布が要らない）。検知は「鍵を差し替えた次の deploy」= 変更が効き始める瞬間になる。**検査するのは値が入っている時の形式だけで、欠落は見ない** — 回転は変数を消さないため。

**上 2 行（メールアドレス変更・パスワード変更）は code では担保できない。** 設定が production で無効化されると、アプリ側は何も変わらないまま本人確認だけが消える。

- `mailer_secure_email_change_enabled` が false になると、旧アドレスの持ち主の同意なしにメールアドレスを変更できる
- `security_update_password_require_current_password` が false になると、`current_password` は**エラーも返さず黙って無視され**、現在パスワードを知らなくてもパスワードを変更できる

2026-08-11 時点の production 実測値は両方 `true`。値の監視は [#1926](https://github.com/Dayopt/dayopt/issues/1926) が担う。

再認証 nonce（`reauthenticate()`）は**現在の設定値では不要**。`security_update_password_require_reauthentication` が false のため GoTrue が nonce を要求しない。この設定が true に変われば nonce フローの実装が要る。

### アカウント削除だけ公開 Auth endpoint を使う理由

上 2 行は #1917 で「公開 Auth endpoint での再認証をやめる」方向に倒したが、**削除だけは倒せない**。GoTrue 側に代替の検証機構が無いため:

| 操作           | 乗り換え先                                          |
| -------------- | --------------------------------------------------- |
| パスワード変更 | `updateUser({ current_password })` の GoTrue 内検証 |
| メール変更     | Secure Email Change                                 |
| **削除**       | **無い**                                            |

`current_password` は `params.Password != nil` の内側でしか読まれず、パスワードだけを検証する endpoint も存在しない。`reauthenticate()` が発行する nonce を消費するのも `PUT /user` のパスワード変更だけで、削除の本人確認には転用できない。

そこで削除は `signInWithPassword` を使い続け、**service-role client から呼ぶことで captcha を構造的に免除する**（[#1925](https://github.com/Dayopt/dayopt/issues/1925)）。実装と契約は `features/auth/server/password-reauthentication.ts`。

この経路の副作用として、**再認証が成功するたび GoTrue に session が 1 本発行される**ため、検証直後に `scope: 'local'` で破棄する。`scope` の省略は既定 `global` で、**ユーザーの全端末が強制ログアウトされる**ため必ず明示する。2026-08-11 時点の production は `sessions_single_per_user: false`（実測）なので、再認証そのものがユーザーの既存セッションを終了させることは無い。この値が true に変わると、削除が後段で失敗した場合に「削除できず、かつ全端末からログアウト」になる。

パスワード誤りは `FORBIDDEN` で返す。`UNAUTHORIZED` にすると client の共通ハンドラが session 失効とみなしてログイン画面へ遷移させ、エラー文言がユーザーに届かない。

**この経路の captcha は bot 対策として数えない。** 免除している以上 Bot Protection 設定を変えても影響を受けず、そもそも captcha は本件の本命脅威（セッションを盗んだ攻撃者による削除）を止めない — 攻撃者は victim のブラウザ文脈を握っているので challenge を解ける。パスワード総当たりの上限にもならない（GoTrue の rate limit は IP 単位で、サーバー呼び出しでは全ユーザーが 1 バケットを共有する）。**削除を守っているのはパスワード再認証そのもの**であり、captcha ではない。

**アプリ側にも試行回数の上限は無い。** `protectedProcedure` に per-user の throttle は無く、GoTrue の `sign_in_sign_ups` は IP 単位。この経路はサーバーから呼ぶため、全ユーザーの再認証が Vercel egress IP の 1 バケットを共有する。したがって:

- セッションを握った攻撃者は、captcha にもアプリ側 throttle にも妨げられずパスワード試行を続けられる
- その試行が 429 を誘発すると、**他ユーザーの削除再認証まで巻き添えで失敗する**（fail-closed なので削除が通ることは無い）

削除を守っているのはパスワードの知識のみで、試行回数の上限は現状どこにも無い。上限を設けるかは別途判断する。

**不正な削除に対する事後の統制は削除通知メールだけで、soft-delete の猶予期間は存在しない。** 削除は CASCADE で回復不能。

### captcha 起因で削除できない場合の代替経路

削除は法的義務なので、fail-closed で詰まった時の逃げ道を用意する。窓口は `support@dayopt.app`（`packages/config/src/constants.ts`）。product の問い合わせダイアログは Turnstile を使わないため、この経路は captcha に依存しない。

本人確認は次の 2 点で行う。根拠は「メールアドレスの支配」で、Secure Email Change と同じ強度に揃えている。

1. 依頼は**アカウントに登録されたメールアドレスからの送信**に限る
2. 実行前に**登録アドレス宛の確認メールを送り、返信を得てから**削除する

この経路を案内するため、削除失敗時の画面文言には問い合わせ先を含める（`settings.account.deletion.error`）。

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

## メール確認リンクの着地先

`/auth/confirm` は token を検証したあと、**session が確立できた時だけ** `next`（保護ページ）へ送る。できなかった場合と検証に失敗した場合は `/auth/confirmed?status=...` へ送り、何が起きたか・次に何をすべきかを表示する（[#1956](https://github.com/Dayopt/dayopt/issues/1956)）。

| status                   | いつ                                                           | 伝えること                               |
| ------------------------ | -------------------------------------------------------------- | ---------------------------------------- |
| `email_change_confirmed` | `type=email_change` の検証成功、session 無し                   | もう一方のアドレスの確認も要ること       |
| `email_confirmed`        | それ以外の type の検証成功、session 無し                       | 確認済みなのでログインすればよいこと     |
| `failed`                 | 検証失敗、token / type の欠落、未知の status（fail closed 先） | リンクが期限切れ・使用済みでありうること |

**「検証成功 ⇒ session あり」は成り立たない。** `double_confirm_changes = true` により email_change は新旧両方のリンクで完了する 2 段フローで、片側の検証だけでは session が立たない。メールクライアントが開く browser がアプリの session cookie を持たない場合も同じで、これは type を問わない。session の有無で分岐するのはこのため。

判定は `data.session?.access_token` で行う。auth-js は `access_token` を伴う session だけを保存する（cookie が書かれる）ので、truthy 判定だと token 無しの session オブジェクトで保護ページへ送ってしまう。

**着地先を login ページにはしない。** `proxy.ts` は認証済みユーザーが auth 系 path に来ると `/week` へ送るため、ログイン中の browser で確認リンクを開くとメッセージが出る前に弾かれる。`/auth/confirmed` は `authPathsAllowedWhileAuthenticated`（`lib/auth/domain/access-policy.ts`）に登録してあり、認証済み・未認証のどちらでも表示できる。**このページを allowlist から外すと本件が再発する。**

## Auth REST API は存在しない

かつて公開 REST route `/api/auth`（signin / signup / signout / reset-password）があり、独自の rate limit を持っていた。**[#1942](https://github.com/Dayopt/dayopt/issues/1942) で削除した**（2026-08-12）。

削除の理由は、呼び出し元がゼロのまま公開されていたため。通常 UI は `useAuthStore` が Supabase Auth を直接呼ぶ経路を使っており、この route は「守るもの」ではなく**未認証の credential 受け口という攻撃面**だった。加えて signin 分岐は captcha token を渡しておらず、production の Bot Protection 下では `captcha_failed` で必ず失敗する状態だった（[#1917](https://github.com/Dayopt/dayopt/issues/1917) / [#1925](https://github.com/Dayopt/dayopt/issues/1925) と同じ故障クラス）。

**したがって現在、認証操作の rate limit は Supabase Auth 自身の project-level rate limit だけが担う**（`rate_limit_email_sent` などは `scripts/production-auth-config-audit.mjs` が pin して drift を検出する）。アプリ側に認証の rate limit 層は無い。将来 server-side の anti-abuse を挟む必要が出たら、その時点で route と limiter を設計し直す。

## tRPC API auth policy

`/api/trpc` は middleware/proxy を通らないため、API gate 自体で認証状態を再評価する。

- Session cookie mode: HTTP / RSC の両 context が共通 resolver を使い、Supabase Auth の `getUser()` でユーザーを検証してから session token と MFA AAL を独立して取得する。session token 取得に失敗しても MFA lookup は続行する
- AAL claim がない有効な従来 session は Supabase の契約どおり `aal1` として扱う。API error / throw、未知値、不正な AAL 遷移、または認証済み context で assurance 自体が欠けた場合は fail closed として `FORBIDDEN` を返す
- MFA登録済み `aal1 -> aal2` の状態は `FORBIDDEN`、MFA未登録 `aal1 -> aal1` と検証済み `aal2 -> aal2` は通過する
- `user.verifyRecoveryCode` は recovery-code 検証により MFA factor を解除するため、既知の `aal1 -> aal2` 状態でも通過を許可する
- OAuth bearer mode: token を `oauth_tokens` で検証し、`client_id` と `scopes` を tRPC context に保持する
- OAuth token は **MCP endpoint（`/api/mcp`）内部からの実行だけ**が tRPC に到達できる。公開 tRPC endpoint（`/api/trpc`）へ同じ token を投げても、scope 判定より手前で `FORBIDDEN` になる（context の `oauthExecution: 'mcp_internal'` が無いため）
- MCP 内部実行でも、procedure path ごとの allowlist（`MCP_TRPC_SCOPE_REQUIREMENTS`、`apps/product/src/lib/trpc/procedures.ts`）と scope が一致した場合だけ許可する。現在の集合:

  | procedure                          | scope              |
  | ---------------------------------- | ------------------ |
  | `plans.list` / `plans.getById`     | `read:entries`     |
  | `records.list` / `records.getById` | `read:entries`     |
  | `statistics.getMcpReview`          | `read:stats`       |
  | `tags.list` / `tags.listArchived`  | `read:tags`        |
  | `timeblockContext.getConstraints`  | `read:constraints` |

  互換 MCP tool `entries.list` も `read:entries` scope を使う。write / delete は tRPC を経由せず、MCP mutation 経路（`private.authorize_mcp_mutation_v1` + 三重 write gate）だけが扱う

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
