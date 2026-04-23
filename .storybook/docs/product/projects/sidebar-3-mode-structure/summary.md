# sidebar-3-mode-structure 完了サマリー

完了日: 2026-04-23

> **overview**: [overview.md](./overview.md) (Phase 2-A 全体 plan `docs/design/sidebar-redesign-plan.md` §4-5 を起点とし、Phase 2-B 実施後の知見を反映して Phase 2-C を詳細化)

## Project ゴール

Calendar / Stats / AI の 3 モード構造を前提に、route group `(modes)` + Sidebar のモード別分離 + Mobile 4 タブ + Desktop 3 タブ構成へ layout を再編する。Sidebar 静止は Phase 2-B で partial rendering が担保することが確認済なので、Option Y (`SidebarContent` の pathname dispatch) で実装する。

## コミット一覧 (時系列、7 件)

| SHA       | タイトル                                                               | 役割                                       |
| --------- | ---------------------------------------------------------------------- | ------------------------------------------ |
| a2c962f5e | refactor(routing): calendar と stats を (modes) route group 配下に移動 | Step C-1: route group 移動                 |
| e66c103fa | refactor(routing): step c-1 の相対 import 修正漏れを補正               | Step C-1 修正: 相対 import 漏れ fix        |
| 0c89531e3 | refactor(routing): sidebar をモード別 component に分離                 | Step C-2: SidebarContent pathname dispatch |
| 972802e7f | feat(ai): ai モード stub を追加                                        | Step C-3: AI route + sidebar + main stub   |
| 34b8bec8f | feat(navigation): bottom tab に ai を追加                              | Step C-4: BottomTabBar 4 タブ化            |
| a3e51cfd1 | feat(navigation): sidebar page nav に ai を追加                        | Step C-5: SidebarPageNav 3 タブ化          |
| 70ef2ed51 | test(e2e): phase 2-c の ai モード追加に smoke test を拡張              | Step C-6: E2E regression guard 拡張        |

## 変更規模

84 ファイル / +2547 / -280 (rename 検出有効)
うち src/ 配下: 81 ファイル / +2385 / -210

Phase 2-C は route group 移動を伴うため、多数の rename を含む。net 増の主因は AI モード stub (route / sidebar / main / threads) の新規追加。

## 技術的成果

- **`(modes)` route group 導入**: Calendar / Stats / AI を `src/app/[locale]/(app)/_shell/(modes)/` 配下に集約。URL は不変 (`(group)` は URL に出ない)
- **Sidebar モード別分離 (Option Y)**: `SidebarContent` が `usePathname` でモードを判定し、`CalendarSidebar` / `StatsSidebar` / `AiSidebar` へ dispatch
- **AI モード stub**: route (`(modes)/ai/page.tsx` + `threads/[threadId]/page.tsx`) + sidebar (3 ブロック構成) + main (empty state) を stub として配置
- **Navigation 拡張**: `BottomTabBar` 4 タブ化 (Calendar / Stats / AI / Account) / `SidebarPageNav` 3 タブ化
- **Watching AI アイコン確定**: Sparkles
- **E2E + Storybook regression guard**: smoke test に AI モード追加、stories 更新

## 後続 Project への引き継ぎ

- **`sidebar-v2-design` (進行中 Phase 2-D)**: v2 デザイン適用。PageNav v2 (expanding tab → 現状縮退) / amber badge / transition 撤去など。3 タブ化は本 project で完了済なので、v2 は stylistic な調整のみ
- **`feature-colocation-migration` (Phase 2-E 予定)**: `_composition/` 等の feature 近接 refactor。本 project で `_shell/(modes)/` 構造を確定したため、その配下の composition を feature 単位で整理する

## 関連リンク

- 親 Plan: `docs/design/sidebar-redesign-plan.md` §4-5
- 全体設計: [overview.md](./overview.md)
- Step 2 詳細: [step-2-detail.md](./step-2-detail.md) — Sidebar モード別分離 (Option Y)
- Step 3 詳細: [step-3-detail.md](./step-3-detail.md) — AI モード stub
- Step 4 詳細: [step-4-detail.md](./step-4-detail.md) — BottomTabBar 4 タブ化
- 先行 Project: `sidebar-routing-unification`
