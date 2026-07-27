---
status: frozen
date: 2026-07-27
---

# 本番 Supabase Auth の設定是正と Google ログインの有効化

認証の本番対応にあたり、Management API で本番 Auth 設定を読んだところ実害のある食い違いが見つかった。是正と Google provider の有効化を同じセッションで実施した記録。

## 実施前の状態と、直した内容

| 項目                      | 変更前                                            | 変更後                                                                                                    |
| ------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `site_url`                | `https://product-dayopt.vercel.app/`              | `https://app.dayopt.app`                                                                                  |
| `uri_allow_list`          | vercel.app 系 15 件（**本番ドメインを含まない**） | `https://app.dayopt.app/**`, `https://product-*-dayopt.vercel.app/**`, `http://localhost:3000/**` の 3 件 |
| `mailer_autoconfirm`      | `true`（確認メールを送らず即有効化）              | `false`                                                                                                   |
| `rate_limit_email_sent`   | 2 通/時                                           | 30 通/時                                                                                                  |
| `external_google_enabled` | `false`（client_id / secret とも空）              | `true`                                                                                                    |

最も影響が大きかったのは allow list。アプリは `https://app.dayopt.app/auth/reset-password` へ戻そうとするが、そのオリジンが 1 件も許可されていなかった。GoTrue は許可外の `redirect_to` を `site_url` にフォールバックさせるため、**本番のパスワードリセットが Vercel の自動生成ドメインへ着地していた**と考えられる。Google ログインの `redirectTo` も同じ経路を通るため、これを直さないと provider を設定しても機能しない。

`rate_limit_email_sent` は、メールアドレス変更が Secure Email Change により 1 操作で 2 通送るため、旧値のままだと 1 回で上限に達する状態だった。

これで [#1460](https://github.com/Dayopt/dayopt/issues/1460)（本番 redirect allowlist の確認と縮小）の受け入れ条件を満たす。

## Google provider の構成

- GCP プロジェクトは**この作業時点で 1 つも存在しなかった**ため新規作成（`dayopt` / `dayopt-503623`）
- OAuth client: `Dayopt Auth (Supabase)`（ウェブアプリケーション）
- redirect URI: `https://yvglwblxrnrenfifsnje.supabase.co/auth/v1/callback` のみ
- 同意画面: アプリ名 `Dayopt`、ホームページ・プライバシー・利用規約に `dayopt.app` の各 URL、承認済みドメイン `dayopt.app`
- 公開ステータスを**本番環境**へ切り替え済み（テストのままだと利用者が 100 人に制限される）
- scope は openid / email / profile のみのため Google の検証申請は不要
- secret は `Dayopt-Production/google-auth` を master とし、Supabase Dashboard を replica とする

サポートメールは個人 Gmail のまま。`support@dayopt.app` は Cloudflare Email Routing の転送エイリアスで Google アカウントではないため、GCP の選択肢に現れない。差し替えるには Google Workspace か Google グループが要る。

## 未確認・残タスク

- **メール確認を有効化したので、新規登録で確認メールが実際に届くかの実地テストが必要**。Edge Function `send-auth-email` は稼働中だが、`email_change` 対応版はまだ未デプロイ
- Google ログインの実挙動確認は、Google 単独・1 カラム構成の branch をマージしてから
- Google 側の設定反映に 5 分〜数時間かかる場合がある旨の注意書きが出ていた
