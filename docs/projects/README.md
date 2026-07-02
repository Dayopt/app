# Projects

進行中プロジェクトの索引。詳細な工程は各 project の `overview.md` / `step-X-detail.md` / `summary.md` を参照。各 project の主要ファイルは frontmatter に `status: active | paused | done` を持つ。

- **進行中 project** の設計書も本ディレクトリ配下に置く (`.claude/rules/workflow.md` §設計書の保存場所)
- **完了 project** は同じディレクトリに `summary.md` を追加する (コミット一覧 / 変更規模 / 技術的成果 / 次 project への引き継ぎ)
- **完了・停止した project** は恒久的な学びをストック側（`architecture/` 等）へ反映した上で [`docs/archive/projects/`](../archive/projects/) へ移動する。本ディレクトリに残るのは `status: active` のみ

## Active projects

| Project                           | 状態   | 概要                                              | 設計書                                                    |
| --------------------------------- | ------ | ------------------------------------------------- | --------------------------------------------------------- |
| `calendar-review-panel-migration` | active | `/review` 独立ページ廃止、Calendar panel への統合 | [overview](./calendar-review-panel-migration/overview.md) |

## Archived projects

学びをストック側へ反映済みで、経緯記録として [`docs/archive/projects/`](../archive/projects/) に保管されているもの。`paused` の project も含む（`shared-packages-restructure` / `timeline-precision-redesign` は再開の余地があるが、直近の active な進行はないため archive 側に置く）。

| Project                       | 状態   | 完了/最終更新日 | 規模                  | summary                                                                                               |
| ----------------------------- | ------ | --------------- | --------------------- | ----------------------------------------------------------------------------------------------------- |
| `sidebar-redesign`            | done   | 2026-04-24      | umbrella (3 子 phase) | [summary](../archive/projects/sidebar-redesign/summary.md) (旧 Phase 2-A umbrella)                    |
| `sidebar-routing-unification` | done   | 2026-04-22      | 8 コミット / -28 行   | [summary](../archive/projects/sidebar-routing-unification/summary.md) (旧 Phase 2-B)                  |
| `sidebar-3-mode-structure`    | done   | 2026-04-23      | 7 コミット / +2267 行 | [summary](../archive/projects/sidebar-3-mode-structure/summary.md) (旧 Phase 2-C)                     |
| `sidebar-v2-design`           | done   | 2026-04-24      | 6 コミット / +275 行  | [summary](../archive/projects/sidebar-v2-design/summary.md) (旧 Phase 2-D)                            |
| `cleanup-2026-04-26`          | done   | 2026-04-26      | cleanup plan          | [overview](../archive/projects/cleanup-2026-04-26/overview.md)                                        |
| `mcp-server`                  | done   | 2026-04-30      | design                | [overview](../archive/projects/mcp-server/overview.md)                                                |
| `review-granularity-redesign` | done   | 2026-06-15      | core-slim方針で縮小   | [summary](../archive/projects/review-granularity-redesign/summary.md)                                 |
| `codebase-refactoring`        | done   | 2026-06-15      | 24 issue / Phase 0-7  | [summary](../archive/projects/codebase-refactoring/summary.md)                                        |
| `foundations-sharing`         | done   | 2026-06-19      | tokens per-token化    | [overview](../archive/projects/foundations-sharing/overview.md)（`shared-packages-restructure` の子） |
| `shared-packages-restructure` | paused | 2026-06-19      | 大規模                | [overview](../archive/projects/shared-packages-restructure/overview.md)                               |
| `timeline-precision-redesign` | paused | 2026-06-15      | design                | [overview](../archive/projects/timeline-precision-redesign/overview.md)（Project A/B/C に分割済み）   |

## 命名規則

`{domain}-{action}[-{variant}]` kebab-case。Phase N-X のような記号的命名は使わない。詳細は `.claude/rules/workflow.md` §Project 命名規則。
