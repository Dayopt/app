---
status: frozen
date: 2026-07-24
code: .claude/settings.json
---

# env ファイルの AI アクセス制限を narrow 化し、境界を provider 共通規約にする

## 背景・当時の前提

1Password 移行（`.op-env.local` + `op run`）完了後も、`.claude/settings.json` の deny に `Read(**/.env.*)` と `Read(**/*secret*)` が残っていた。実態を調査した結果:

- tracked な env ファイルは `apps/product/.env.example` / `apps/web/.env.example` の 2 つだけで、中身は `op://` 参照の雛形。secret ゼロなのに読み書きともブロックされ、env var 追加時に agent が雛形更新を完結できなかった
- `**/*secret*` に当たる tracked ファイルは 5 つ全部が docs / script / migration（`docs/operations/secrets.md`、`scripts/env/check-secrets.ts` 等）。Secrets 運用の正本ドキュメント自体が読めず、しかも `git show` で迂回可能だった — 保護効果ゼロで摩擦だけが残っていた

## 決定と理由

**全撤廃ではなく narrow 化**。誤爆分を解除し、実値が入りうるファイルだけ deny を残す。

- `.claude/settings.json`: `Read(**/.env.*)` / `Read(**/*secret*)` を削除し、gitignore の実値ファイル一覧をミラーした明示 deny（`.env.local` / `.env.*.local` / `.env.development` / `.env.staging` / `.env.production`）に置き換え
- `.claude/hooks/pre-tool-guard.sh`: Write/Edit ブロックに `*.env.example) ;;` の許可分岐を追加
- 境界の正本を `docs/operations/secrets.md` §AI エージェントの env ファイル境界 に置き、AGENTS.md Non-Negotiables から参照。Claude の settings / hook はその実装で、Codex など他 agent も同じ規約を読む

全撤廃しない理由: `vercel env pull` が生成する `.env.local` や `supabase/.env` など、実値入りファイルは一時的には今後も発生する。読めば実値が agent の会話ログに載り、secrets.md 方針 4「値を表示しない」に反する。1Password 移行後の設計は「agent が値を見ずに `op run` 経由で secret を使う」ことであり、実値ファイルを読める必要はない。バックストップの維持コストはゼロ。

## 検証

- 変更後の同一セッションで `docs/operations/secrets.md` の Read が通ることを確認（変更前は deny され `git show` 迂回が必要だった）
- literal secret の混入検出は `pnpm secrets:check` が引き続き担う
