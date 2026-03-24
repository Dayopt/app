#!/bin/bash
# PostCompact hook: コンテキスト圧縮後にアーキテクチャルールを再注入
# additionalContext として出力し、Claudeのコンテキストに追加される

cat <<'CONTEXT'
{
  "additionalContext": "## リマインド（PostCompact hook）\n\n### 必須ルール\n- `any` / `as any` 禁止 → 具体的な型を使用\n- `console.log` 禁止 → `@/lib/logger`\n- `export default` 禁止（App Router特殊ファイル例外）\n- 直接カラー禁止 → セマンティックトークン\n- feature間の直接import禁止 → Composition Layer経由\n\n### ワークフロー\ntypecheck → lint → lint:boundaries → コミット\n\n### コミットメッセージ\n日本語・Conventional Commits形式"
}
CONTEXT

exit 0
