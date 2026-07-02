# sidebar-redesign 完了サマリー

完了日: 2026-04-24

> **overview**: [overview.md](./overview.md) — 2026-04-22 策定の umbrella plan (旧 Phase 2-A)

## Project ゴール

Dayopt の `(app)/` shell / composition / routing を再設計し、Calendar / Stats / AI の 3 モード構造 + v2 デザインを実現する umbrella plan。plan 策定時点で Phase 2-B (router 統一) → 2-C (layout 再編) → 2-D (v2 デザイン) の直列実施を想定し、各 phase を子 project として実行した。

## 子 project 一覧

| Phase | Project                       | 完了日     | summary                                              |
| ----- | ----------------------------- | ---------- | ---------------------------------------------------- |
| 2-B   | `sidebar-routing-unification` | 2026-04-22 | [summary](../sidebar-routing-unification/summary.md) |
| 2-C   | `sidebar-3-mode-structure`    | 2026-04-23 | [summary](../sidebar-3-mode-structure/summary.md)    |
| 2-D   | `sidebar-v2-design`           | 2026-04-24 | [summary](../sidebar-v2-design/summary.md)           |

## 統合成果

umbrella plan + 3 子 project 合計の技術的成果:

- **Routing 統一**: `ClientPageRouter` 撤去 + `<Link prefetch>` + pathname ベースへ一本化 (2-B)
- **3 モード layout**: `(modes)` route group + `SidebarContent` pathname dispatch で Calendar / Stats / AI を分離 (2-C)
- **v2 デザイン適用**: PageNav v2 (Sidebar header 直下、tooltip、β バッジ) + AiSidebar 見出し統一 (2-D)
- **AI モード stub**: `_shell/(modes)/ai/` に route + sidebar + main を placeholder として配置。Watching AI 本実装 (Phase 3) まで β バッジで stub 状態を明示
- **regression guard**: E2E (mode-switching / sidebar-persistence / deep-link) + Storybook 主要 variant が揃う

## Plan 策定時からの乖離

plan 策定時点 (2026-04-22) の想定 Phase 数: 2-A (plan) → 2-B → 2-C → 2-D の 4 phase。

- **Phase 2-E (feature-colocation-migration)**: plan には含まれていなかった feature コロケーション refactor。2-D 完了時点で wip を削除 (本 umbrella の scope 外と判断)。必要になった時点で別 project として改めて着手
- **plan §4.3 Portal 方式 Sidebar 外殻共通化**: 2-C の Option Y (`SidebarContent` pathname dispatch) 採用で不要化し、撤回

## 後続 Project

- **watching-ai-implementation** (Phase 3 以降): AI モード stub の本実装。β バッジ表記を継続するか外すかも本 project で判断

## 関連リンク

- 全体設計: [overview.md](./overview.md) (plan 原本)
- Phase 2-B: [sidebar-routing-unification/summary.md](../sidebar-routing-unification/summary.md)
- Phase 2-C: [sidebar-3-mode-structure/summary.md](../sidebar-3-mode-structure/summary.md)
- Phase 2-D: [sidebar-v2-design/summary.md](../sidebar-v2-design/summary.md)
