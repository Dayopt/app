---
status: frozen
updated: 2026-07-07
---

# AI 設定棚卸し 2026-07

`audit-ai-config` skill による四半期棚卸しの第 1 回。skills / rules / commands / agents / hooks / settings / MCP / AGENTS.md を全数調査し、重複 2 件の削除、`.agents/skills/` の symlink 一本化、モデル名ハードコードの解消を実施した。次回目安は 2026-10。

---

## 調査方法

3 系統の並列調査:

1. **インベントリ**: `.claude/skills/`(13) / `.agents/skills/`(14) / `.claude/commands/`(6) / `.claude/rules/`(12) / `.claude/agents/`(2) / `.codex/`(rules 3 + agents 2 + hooks 7) / `.mcp.json`(9 servers) / `AGENTS.md`
2. **使用実績**: `docs/engineering/log/` のセッションログ（2026-04 以降）と docs 全体での言及回数
3. **重複・drift**: `.claude/` ↔ `.agents/` ↔ `.codex/` の diff 照合

## 主要な発見

### 健全だったもの

- rules 12 ファイル間に重複なし。AGENTS.md → `.claude/rules/` 正本参照の構造は機能している
- `.codex/rules/` は overlay 3 ファイルのみで方針（二重管理禁止）どおり
- hooks は `.claude/hooks/` を canonical に `.claude/settings.json` / `.codex/hooks.json` の両方から参照されており重複なし
- skill の description / When to Use は全体的に skill-design.md 準拠で品質が高い

### 問題と対応

| 問題                                                                                                                                          | 対応                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `.claude/commands/daily-end.md` が session-end + gardening に置換済みの旧版として残存（AGENTS.md 掲載もなし）                                 | 削除                                                                                                                                         |
| `.agents/skills/source-command-plan-review/` が `.claude/commands/plan-review.md` の自動移行コピーで二重管理                                  | 削除。正本は command 側。AGENTS.md のコマンド一覧に `/plan-review` を追記                                                                    |
| `.claude/skills/` と `.agents/skills/` がコピー二重管理で 12/13 skill が drift（`.agents/` 側は monorepo 移行前のパス・npm 表記のまま陳腐化） | `.agents/skills/*` を `.claude/skills/*` への相対 symlink に一本化。`.agents/` 側にしか無い有用な差分は無いことを diff で確認済み            |
| モデル名ハードコード: `ai-behavior.md`（Haiku/Sonnet/Opus 表）、`mcp-usage.md`（「Opus 4.7 は…」）                                            | 能力ティア（軽量/標準/最上位）表現に書き換え。モデル名は ai-behavior.md 末尾の「現行モデルマッピング」1 表に集約。世代交代時はその表のみ更新 |
| `.codex/agents/*.toml` が `.claude/agents/*.md` の全文複製                                                                                    | toml を「md を Read して従う」thin pointer に縮小                                                                                            |
| core-slim で確立した機能削除の順序（コード削除 → deploy → Sentry 確認 → migration drop）がセッションログにしか無い                            | `supabase` skill に「機能削除の順序」節として追記                                                                                            |
| storybook → eagle-dayopt の handoff が片方向のみ                                                                                              | storybook skill の When NOT to Use に eagle-dayopt への redirect を追記                                                                      |
| 棚卸しが単発で終わるリスク                                                                                                                    | `/gardening` にステップ 5「四半期ごとに audit-ai-config を提案」を追加                                                                       |

## 使用実績（参考値）

docs ログ言及ベース（skill の暗黙発火はログに残らないため下限値）:

- **活発**: storybook / test / i18n / supabase / security、command では decision / note
- **言及ゼロだが保持**: error-handling / optimistic-update / trpc-router-creating / store-creating（実装トリガー型は発火が記録に残らない）、eagle-dayopt / blog-ideas / docs-audit（明示発動型。用途がこれから来る想定で保持、次回棚卸しで再評価）
- blog-ideas / docs-audit は repo 外（user-global skill）のため repo 棚卸しの対象外

## 見送った提案（理由つき）

- **新規 skill / agent の追加** — 現在の開発テーマ（LP ローンチ、core-slim、Review 再設計）は既存 13 skill + 6 commands + 2 agents でカバーされる。機能削除順序も supabase skill への節追記で足りた
- **特定モデル前提の多エージェント編成（Workflow 等）の導入** — モデル非依存を最優先する方針のため。特定上位モデルが常用できる環境が固定されたら、`/plan-review` の多視点化や大規模リファクタのファンアウトが候補になる
- **`.claude/settings.json` の permissions 見直し** — 今回指摘事項なし。許可プロンプトが煩雑になったら `/fewer-permission-prompts` の実行を検討
- **未使用 skill の削除** — 保持を選択。次回棚卸し（2026-10）時点でも使用実績ゼロなら削除候補に戻す

## 次回棚卸し（2026-10 目安）のチェックポイント

- eagle-dayopt / blog-ideas / docs-audit の使用実績
- `.agents/skills/` symlink が Codex で問題なく読めているか
- ai-behavior.md「現行モデルマッピング」の鮮度
- skill 本文の陳腐化（とくに 2026-06-04 更新組: error-handling / optimistic-update / test / store-creating / trpc-router-creating / security）
