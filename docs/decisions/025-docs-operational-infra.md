---
date: 2026-07-02
status: accepted
---

# docs 運用基盤の導入(CI・コマンド・月次ガーデニング)とやらないことリスト

## 背景・当時の前提

[ADR-024](024-docs-restructure.md) で docs/ の構造をストック/ログに再編したが、構造だけでは鮮度は保てない。手作業のルールは読み飛ばされる。仕組みで守らせる基盤（CI・儀式のコマンド化・受け皿の新設）を作る。

## 決定と理由

以下を導入する。

1. **docs CI（`scripts/docs-guard/` + `.github/workflows/docs-guard.yml`）** — リンク切れ・frontmatter必須・命名規約・append-onlyガードを機械的に検証する。gitleaksによるsecret scanをリポジトリ全体に追加
2. **儀式のコマンド化（`.claude/commands/`）** — `/decision` `/note` `/session-end` `/gardening` の4コマンドで、散文のルールを読み飛ばさず実行させる
3. **新しい器**（`operations/external-services.md`、`product/features/`、`business/metrics.md`、`business/legal/`）— 受け皿がなく書く場所に迷っていたコンテンツの置き場を新設
4. **双方向アンカー** — docs↔コードを `code:` frontmatter・doc pointer コメント・Storybook Welcome ページで相互参照可能にする

理由: ルールを増やすことではなく、①機械に守らせる ②鮮度と昇格のループを回す ③受け皿を作る、の3つを目的とする。

## 却下した選択肢と、なぜ捨てたか

- **ドキュメントサイト化（Docusaurus等）** — 読者はAIとgrepする開発者本人のみで、ビルド・ホスティングのコストに見合わない
- **タグ体系や凝ったメタデータ** — `status` / `last_verified` / `code` の3キーで用は足りる。過剰なメタデータは維持コストが便益を上回る
- **自動索引の作り込み** — `docs/README.md` の冒頭要約 + grep で代替できる。索引生成の仕組み自体が保守対象になることを避ける
- **これ以上の規約追加** — 新しい規約を追加する場合は必ずCIチェックかコマンドとセットで導入する。守れないルールは負債になる

## 影響・やること

- `pnpm docs:check` がローカル/CIの両方でdocsガードを実行する
- `docs/operations/secrets.md` の実秘密値監査はサンドボックス権限の制約で未完了（フォローアップ課題として残置）
- `docs-restructure` ブランチ自体（ADR-024の作業）は append-only ガード導入前の変更を含むため、`docs/decisions` `docs/notes` 等への一部修正が本ブランチのマージ後に初めて guard の保護対象になる（この PR 自体は grandfathered）
