---
status: current
last_verified: 2026-07-06
code: apps/product/src/features/contact
---

# Contact（フィードバック）

ユーザーからのフィードバック送信機能。

## 現在の振る舞い

- フォーム経由でユーザーの声（感想・要望・不具合報告）を受け付ける
- 送信内容は GitHub Issue として自動起票する（repo: `GITHUB_CONTACT_REPO`、labels: 運用側で決めた正規ラベル（`type` / `priority` / `status` / `area` / `size` / `quality` / `scope`））。Web側（dayopt.app/contact）と同一フォーマット
- **起票は best-effort**: GitHub API の失敗・env 未設定時もユーザーの送信は成功扱いとし、内容を構造化ログと Sentry event（`source: contact`）へ退避する。フィードバックはどの経路でも失われない
- GitHub API 呼び出しは 10 秒でタイムアウト（Web側と同値）
- レート制限は userId ベース（Upstash）
- 受け取ったフィードバックは `docs/product/log/YYYY-MM-DD-feedback-<slug>.md` に記録する運用（AGENTS.md 参照）。GitHub Issue 起票により一次記録は自動化されており、docs への記録は「原文の凍結」として行う

## 運用前提

- `GITHUB_TOKEN` / `GITHUB_CONTACT_REPO` を product アプリの本番 env に設定する（web プロジェクトには設定済み。運用は `docs/operations/secrets.md` に従う）
- env 未設定の間も送信は成功するが、内容の回収先が Sentry / ログのみになる
