# Projects

Project 単位の完了記録アーカイブ。詳細な工程は各 project の `overview.md` / `step-X-detail.md` / `summary.md` を参照。

- **進行中 project** の設計書は `docs/design/` に置く (`.claude/rules/workflow.md` §設計書の保存場所)
- **完了 project** の設計書は本ディレクトリに移動する (`git mv` で履歴追跡)
- 完了時に `summary.md` を追加する (コミット一覧 / 変更規模 / 技術的成果 / 次 project への引き継ぎ)

## Active projects

現在進行中の設計書はありません (`docs/design/` は空)。新規 project 着手時に配置する運用。

## Completed projects

| Project                       | 完了日     | 規模                  | summary                                                            |
| ----------------------------- | ---------- | --------------------- | ------------------------------------------------------------------ |
| `sidebar-redesign`            | 2026-04-24 | umbrella (3 子 phase) | [summary](./sidebar-redesign/summary.md) (旧 Phase 2-A umbrella)   |
| `sidebar-routing-unification` | 2026-04-22 | 8 コミット / -28 行   | [summary](./sidebar-routing-unification/summary.md) (旧 Phase 2-B) |
| `sidebar-3-mode-structure`    | 2026-04-23 | 7 コミット / +2267 行 | [summary](./sidebar-3-mode-structure/summary.md) (旧 Phase 2-C)    |
| `sidebar-v2-design`           | 2026-04-24 | 6 コミット / +275 行  | [summary](./sidebar-v2-design/summary.md) (旧 Phase 2-D)           |

## 命名規則

`{domain}-{action}[-{variant}]` kebab-case。Phase N-X のような記号的命名は使わない。詳細は `.claude/rules/workflow.md` §Project 命名規則。
