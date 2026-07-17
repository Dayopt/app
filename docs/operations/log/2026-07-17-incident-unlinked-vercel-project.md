---
status: frozen
date: 2026-07-17
last_verified: 2026-07-17
issue: 1566
---

# 未リンク worktree から空の Vercel project を作成した

2026-07-17、Sentry rollout の Preview 確認中に、Vercel project へ未リンクの一時 worktree で確認コマンドを実行し、意図しない空 project `dayopt-sentry-web-rollout` を作成した。作成直後に deployment が0件であることを確認し、その project だけを削除した。

## 起きた事実

- 一時 worktree で `vercel curl --yes` を実行した際、既存 project への link がなかった。
- `--yes` により確認を省略したまま、worktree 名由来の新規 project が作成された。
- 作成から1分以内に project 一覧と deployment 一覧を確認し、新規 project の deployment は0件だった。
- project ID と作成時刻で対象を限定し、空 project だけを削除した。
- 削除後に同名 project が存在しないことを再確認し、一時 worktree の `.vercel` link も除去した。
- 既存の `web` / `product` project、deployment、environment variable は変更されていない。
- secret 値、DSN、token は取得・記録していない。

## 影響範囲

- 顧客向け deployment、domain、traffic、Sentry event への影響はなかった。
- 誤作成した project に deployment、domain、environment variable、integration は存在しなかった。
- Vercel account には短時間、空 project が1件だけ追加されていた。

## 学び

- 未リンク directory では `vercel ... --yes` が read-only の確認ではなく project 作成を伴う場合がある。
- Vercel CLI で既存 project を確認する前に、固定済み project ID / org ID へ明示的に link し、実行後に link を除去する。
- project mutation の前後では、対象 project ID、deployment 数、既存 project の不変性を確認する。
- `--yes` は project 作成や link を行わないことが確認できる command に限定する。

## 関連

- GitHub Issue #1566
- GitHub Issue #1558
