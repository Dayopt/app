---
status: current
last_verified: 2026-07-17
code: apps/product/src/features/contact
---

# Contact（フィードバック）

ユーザーからのフィードバック送信機能。

## 現在の振る舞い

- フォーム経由でユーザーの声（感想・要望・不具合報告）を受け付ける
- 送信内容は GitHub Issue として自動起票する（repo: `GITHUB_CONTACT_REPO`、labels: 運用側で決めた正規ラベル（`type` / `priority` / `status` / `area` / `size` / `quality` / `scope`））。Web側（dayopt.app/contact）と同一フォーマット
- GitHub API の失敗・env 未設定時は送信失敗として表示し、ダイアログと入力本文を保持して再送できるようにする。本文・emailは構造化ログやSentryへ退避しない
- `GITHUB_CONTACT_REPO`はアクセスを制限したprivate repositoryに限る。両アプリともIssue作成前にGitHub APIでvisibilityを検証し、公開・不明・不正形式なら本文やemailを送らず失敗する
- 配送失敗のSentry event（`source: contact`）には元のErrorとuser ID、category等の技術情報だけを含める
- GitHub API 呼び出しは 10 秒でタイムアウト（Web側と同値）
- レート制限は userId ベース（Upstash）
- 受け取ったフィードバックは `docs/product/log/YYYY-MM-DD-feedback-<slug>.md` に記録する運用（AGENTS.md 参照）。GitHub Issue 起票により一次記録は自動化されており、docs への記録は「原文の凍結」として行う

## 運用前提

- `GITHUB_TOKEN` / `GITHUB_CONTACT_REPO` を両アプリの本番 env に設定する。repositoryのprivate設定とtokenの最小権限を確認し、運用は `docs/operations/secrets.md` に従う
- env 未設定の間は送信に失敗し、入力本文を保持したまま再送を促す
