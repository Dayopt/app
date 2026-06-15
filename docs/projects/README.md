# Projects

Project 単位の完了記録アーカイブ。詳細な工程は各 project の `overview.md` / `step-X-detail.md` / `summary.md` を参照。

- **進行中 project** の設計書も本ディレクトリ配下に置く (`.claude/rules/workflow.md` §設計書の保存場所)
- **完了 project** は同じディレクトリに `summary.md` を追加する
- 完了時に `summary.md` を追加する (コミット一覧 / 変更規模 / 技術的成果 / 次 project への引き継ぎ)

## Active projects

現在進行中の設計書はありません。新規 project 着手時は `docs/projects/{project}/overview.md` に配置する。

## Completed projects

| Project                       | 完了日     | 規模                  | summary                                                            |
| ----------------------------- | ---------- | --------------------- | ------------------------------------------------------------------ |
| `sidebar-redesign`            | 2026-04-24 | umbrella (3 子 phase) | [summary](./sidebar-redesign/summary.md) (旧 Phase 2-A umbrella)   |
| `sidebar-routing-unification` | 2026-04-22 | 8 コミット / -28 行   | [summary](./sidebar-routing-unification/summary.md) (旧 Phase 2-B) |
| `sidebar-3-mode-structure`    | 2026-04-23 | 7 コミット / +2267 行 | [summary](./sidebar-3-mode-structure/summary.md) (旧 Phase 2-C)    |
| `sidebar-v2-design`           | 2026-04-24 | 6 コミット / +275 行  | [summary](./sidebar-v2-design/summary.md) (旧 Phase 2-D)           |
| `cleanup-2026-04-26`          | 2026-04-26 | cleanup plan          | [overview](./cleanup-2026-04-26/overview.md)                       |
| `mcp-server`                  | 2026-04-30 | design                | [overview](./mcp-server/overview.md)                               |
| `timeline-precision-redesign` | 2026-04-28 | design                | [overview](./timeline-precision-redesign/overview.md)              |
| `codebase-refactoring`        | 2026-06-15 | 24 issue / Phase 0-7  | [summary](./codebase-refactoring/summary.md)                       |

## 命名規則

`{domain}-{action}[-{variant}]` kebab-case。Phase N-X のような記号的命名は使わない。詳細は `.claude/rules/workflow.md` §Project 命名規則。
