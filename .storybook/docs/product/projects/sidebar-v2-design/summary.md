# sidebar-v2-design 完了サマリー

完了日: 2026-04-24

> **overview**: [overview.md](./overview.md) (Phase 2-A 全体 plan `../sidebar-redesign/overview.md` §7 Phase 2-D を継承)

## Project ゴール

Phase 2-C で確立した 3 モード構造 (Calendar / Stats / AI) の上に、v2 デザインを適用する。Sidebar header 直下への PageNav 配置、AI タブへの β バッジ表示、AiSidebar の見出し統一など、routing / 構造変更なしの視覚 refactor。

## コミット一覧 (時系列、6 件)

| SHA       | タイトル                                                                | 役割                                     |
| --------- | ----------------------------------------------------------------------- | ---------------------------------------- |
| 1583285e5 | feat(navigation): pagenav v2 と sidebar header 直下への配置移動         | Step D-2 pt 1: PageNav v2 + 配置移動     |
| d7386d2c2 | feat(navigation): pagenav に tooltip 追加と transition 撤去             | Step D-2 pt 2: tooltip + transition 撤去 |
| 5c381d4fc | feat(navigation): ai タブに β バッジを追加                              | Step D-5: amber β バッジ実装             |
| 1dd27cec8 | refactor(sidebar): ai sidebar の見出しを SidebarSection に統一          | Step D-6 pt 1: 見出し統一                |
| 94b0cd326 | fix(sidebar): ai sidebar content の padding を calendar と統一          | Step D-6 pt 2: 行単位 padding            |
| fdb8ca690 | fix(sidebar): ai sidebar 外側に px-2 を追加して Calendar と余白を揃える | Step D-6 pt 3: 外側 wrapper px-2         |

## 変更規模

12 ファイル前後 / +442 / -167 / net **+275 行** (実装コード + stories、docs 除く)

## 実施範囲 (仕分け結果)

設計書 §7 では 7 Step (D-0 〜 D-7) が計画されていたが、進行中に必要要件を見直し、以下に縮小して完了:

| Step | 状態 | 実施内容                                                                   |
| ---- | ---- | -------------------------------------------------------------------------- |
| D-0  | skip | mock HTML 不要方針確定済 (2026-04-23)                                      |
| D-1  | skip | 相談事項 B / C が既存トークンで解決、tokens 追加不要                       |
| D-2  | 実施 | PageNav v2 + Sidebar header 直下配置 + tooltip (2 commit)                  |
| D-3  | 吸収 | transition 撤去は D-2 で実施済                                             |
| D-4  | 捨て | BottomTabBar transition 調整は cosmetic、launch 前に必要性なし             |
| D-5  | 実施 | AI タブに amber β バッジ                                                   |
| D-6  | 実施 | AiSidebar の見出し + 余白を CalendarSidebar に統一 (3 commit)              |
| D-7  | 吸収 | Storybook variant は D-5 (NavBadge) / D-6 (AiSidebar) 内で最小セット追加済 |

## 技術的成果

- **PageNav v2**: expanding tab から tooltip + active 固定幅の構成へ。Sidebar header 直下に配置変更し、AppHeader 3 箇所の重複 slot を解消
- **NavBadge**: 新 component (`variant: 'new' | 'beta'`)。`bg-warning` 既存トークンを流用し、i18n 対応。PageNav / BottomTabBar 両方に統合 (AI タブに β 固定)
- **AiSidebar 見出し統一**: h2 タイトル + uppercase xs ラベルを SidebarSection に置換し、CalendarSidebar の Tag セクションと視覚パターンを揃えた
- **余白整合**: Sidebar.tsx の content 領域が padding なし前提で、各モード Sidebar が自分で `px-2` を持つ規約を明文化。AiSidebar の抜け漏れを修正

## ハマり点 / 学び

- **Barrel 経由 import の test 環境問題**: `@/lib/components/shell/sidebar` 経由で `SidebarSection` / `NavBadge` を import すると、barrel チェーンが `Sidebar → UserMenu → next-intl navigation` を引き込み vitest の module 初期化が失敗する。該当箇所は deep import (`@/lib/components/shell/sidebar/NavBadge`) で回避
- **Sidebar content の padding 規約**: `Sidebar.tsx` の content 領域は `px-0`。外側 wrapper は各モード Sidebar の責務。AiSidebar 新設時にこの規約を見落とし、後工程で余白ズレが顕在化した
- **Phase 2-E との並行進行**: AiSidebar 周りの Phase 2-D polish と Phase 2-E (feature-colocation-migration) の AiSidebar rename が同時進行し、一度 working tree 状態が錯綜。path-limited commit で切り分けて吸収

## 後続 Project への引き継ぎ

- **`feature-colocation-migration` (Phase 2-E、進行中)**: 本 project の最終 commit 時点で AiSidebar rename は取り込み済。残り rename 対象 (`AiMainContent.tsx` / `features/ai/index.ts` 等) は WIP 保持
- Watching AI 本実装 (Phase 3 以降) で β バッジの扱いを再判断 (恒久 β 表示の現行を継続 or 外す)

## 関連リンク

- 親 Plan: `../sidebar-redesign/overview.md` §7 Phase 2-D
- 全体設計: [overview.md](./overview.md)
- 先行 Project: `sidebar-3-mode-structure`
- 並行 Project: `feature-colocation-migration` (進行中)
