# Projects

進行中プロジェクトの索引。詳細な工程は各 project の `overview.md` / `step-X-detail.md` / `summary.md` を参照。各 project の主要ファイルは frontmatter に `status: active | paused | done` を持つ。

- **進行中 project** の設計書も本ディレクトリ配下に置く (`.claude/rules/workflow.md` §設計書の保存場所)
- **完了 project** は同じディレクトリに `summary.md` を追加する (コミット一覧 / 変更規模 / 技術的成果 / 次 project への引き継ぎ)
- **完了・停止した project** は恒久的な学びをストック側（`architecture/` 等）へ反映した上で [`docs/archive/projects/`](../archive/projects/) へ移動する

## Active projects

| Project                           | 状態   | 概要                                               | 設計書                                                                                          |
| --------------------------------- | ------ | -------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `calendar-review-panel-migration` | active | `/review` 独立ページ廃止、Calendar panel への統合  | [overview](./calendar-review-panel-migration/overview.md)                                       |
| `shared-packages-restructure`     | paused | product/web 共有デザインシステムレイヤーへの再編   | [overview](./shared-packages-restructure/overview.md)（子project `foundations-sharing` は完了） |
| `timeline-precision-redesign`     | paused | Timeline精度の非対称設計。Project A/B/C に分割済み | [overview](./timeline-precision-redesign/overview.md)                                           |

## Completed projects（本ディレクトリに残置）

学びの抽出・ストック反映がまだ完了していない、または直近の作業として参照頻度が高いもの。

| Project                       | 完了日     | 規模                 | summary                                                                                    |
| ----------------------------- | ---------- | -------------------- | ------------------------------------------------------------------------------------------ |
| `mcp-server`                  | 2026-04-30 | design               | [overview](./mcp-server/overview.md)                                                       |
| `review-granularity-redesign` | 2026-06-15 | core-slim方針で縮小  | [summary](./review-granularity-redesign/summary.md)                                        |
| `codebase-refactoring`        | 2026-06-15 | 24 issue / Phase 0-7 | [summary](./codebase-refactoring/summary.md)                                               |
| `foundations-sharing`         | 2026-06-19 | tokens per-token化   | [overview](./foundations-sharing/overview.md)（`shared-packages-restructure` の子project） |

## Archived projects

学びをストック側へ反映済みで、経緯記録として [`docs/archive/projects/`](../archive/projects/) に保管されているもの。

| Project                       | 完了日     | 規模                  | summary                                                                              |
| ----------------------------- | ---------- | --------------------- | ------------------------------------------------------------------------------------ |
| `sidebar-redesign`            | 2026-04-24 | umbrella (3 子 phase) | [summary](../archive/projects/sidebar-redesign/summary.md) (旧 Phase 2-A umbrella)   |
| `sidebar-routing-unification` | 2026-04-22 | 8 コミット / -28 行   | [summary](../archive/projects/sidebar-routing-unification/summary.md) (旧 Phase 2-B) |
| `sidebar-3-mode-structure`    | 2026-04-23 | 7 コミット / +2267 行 | [summary](../archive/projects/sidebar-3-mode-structure/summary.md) (旧 Phase 2-C)    |
| `sidebar-v2-design`           | 2026-04-24 | 6 コミット / +275 行  | [summary](../archive/projects/sidebar-v2-design/summary.md) (旧 Phase 2-D)           |
| `cleanup-2026-04-26`          | 2026-04-26 | cleanup plan          | [overview](../archive/projects/cleanup-2026-04-26/overview.md)                       |

## 命名規則

`{domain}-{action}[-{variant}]` kebab-case。Phase N-X のような記号的命名は使わない。詳細は `.claude/rules/workflow.md` §Project 命名規則。
