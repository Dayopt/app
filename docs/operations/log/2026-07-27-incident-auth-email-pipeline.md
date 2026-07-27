---
status: frozen
date: 2026-07-27
---

# 認証メールが本番で一度も送信できない構成だった

PR #1744 マージ後の smoke テストで、認証メール（signup 確認 / パスワードリセット / メール変更）が本番で構造的に送信不能であることを検出した。単一障害ではなく、**パイプラインの各段に独立した欠陥が 4 つ**あり、手前の段が失敗するため奥の欠陥が露見しないまま積み重なっていた。

## 障害の連鎖（検出順）

各修正で次の段の欠陥が露見した。すべて同日中に修復した。

| #   | 段                     | 症状                                     | 原因                                                                                                                        | 修正                                                                |
| --- | ---------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1   | フォーム → GoTrue      | `/recover` が 400 `captcha_failed`       | `PasswordResetForm` だけ Turnstile 未実装（login / signup にはあった）                                                      | PR #1745                                                            |
| 2   | GoTrue → Edge Function | `500: Hook requires authorization token` | `verify_jwt = true`。Auth hook は JWT を付けずに POST する                                                                  | verify_jwt を false へ（Management API + config.toml + 回帰テスト） |
| 3   | 署名検証               | 401 `No matching signature found`        | **GoTrue と Edge Function が別々の hook secret を保持**。1Password の master は空                                           | secret を新規生成し 1Password → GoTrue / EF の 3 点へ同期           |
| 4   | テンプレート描画       | 401 `React is not defined`               | `functions/deno.json` に `compilerOptions.jsx` が無く classic transform になるが、テンプレートは React を import していない | `jsx: react-jsx` を設定し `--use-api` で手動デプロイ                |

隣接して、Edge Function の From fallback が `auth@send.dayopt.app`（Return-Path 用 DNS で From には使えない。2026-07-21 incident で確定済み）に戻っていた。apps 側には回帰テストがあるが Edge Function は網の外だった。`noreply@dayopt.app` へ修正し、EF secrets に `RESEND_FROM_EMAIL` / `NEXT_PUBLIC_APP_URL` を明示設定した。

## なぜ長期間気づかなかったか

- signup 確認は `mailer_autoconfirm = true` で**送信自体が発生しない設定**だった
- パスワードリセットは #1（captcha）で入口落ちし、hook まで到達しなかった
- メール変更は Edge Function が `email_change` 未対応で別途 400 だった（PR #1744 で修正）
- 画面には汎用エラーしか出ず、Auth ログを読むまでどの段で落ちたか分からない

「稼働中の本番設定」を正として信頼したことも敗因。PR #1744 で `verify_jwt` を宣言した際、production の現行値（true）に合わせたが、**その現行値で hook は一度も成立していなかった**。動作実績のない設定は現行値でも正にならない。

## 検証（修復後の E2E、本番実測）

1. `https://app.dayopt.app/auth/password` から送信（Turnstile 通過）
2. `noreply@dayopt.app` から Gmail へ受信
3. リンク形式 `https://app.dayopt.app/auth/confirm?token_hash=pkce_...&type=recovery&next=/auth/reset-password`
4. リンクを踏み、`app.dayopt.app` 上の新パスワード設定画面へ着地

これにより #1460 の最終受け入れ条件（confirm / reset が意図した origin へ戻る）も実測で満たした。

## 恒久対策

- `scripts/auth-hook-config.test.ts`: `[functions.send-auth-email]` の宣言・`verify_jwt = false`・import map の実在・From fallback の apex 縛りを CI で固定
- `supabase/config.toml` の `[functions.send-auth-email]` 宣言により、以後は merge で自動デプロイ（手動デプロイ忘れによる乖離を根絶）
- supabase skill に「Auth Hook を受ける Edge Function は `verify_jwt = false`」を明記

## 学び

- パイプラインの検証は「1 箇所直して再試行」ではなく、**最初に全段を列挙して各段の前提を突き合わせる**。今回は secret の 3 点照合（1Password / GoTrue / EF）をハッシュ比較で行い、値を見ずに不一致を特定できた
- 読み戻し API が返すのは保存値とは限らない（Supabase の secrets API は sha256 表現を返す）。照合は実際の署名検証で確定させる
- 一度も実行されていない経路の設定値は、本番の現行値であっても信頼しない
