# sidebar-routing-unification 完了サマリー

完了日: 2026-04-22

> **overview**: 本 project は Phase 2-A の全体 plan (`docs/design/sidebar-redesign-plan.md` §8) を overview として継承する。Phase 2-B 固有の全体設計書は新設していない。本 project 配下には Step 4 詳細設計 (`step-4-detail.md`) のみ配置。

## Project ゴール

`window.history.pushState` + `useClientRouterStore` による二重管理と `ClientPageRouter` 特殊経路を撤去し、Next.js App Router の標準 routing に一本化する。Sidebar 静止は layout partial rendering に委ね、prefetch は SSR prefetch + `<Link prefetch>` で担保する。

## コミット一覧 (時系列、8 件)

| SHA       | タイトル                                                         | 役割                                        |
| --------- | ---------------------------------------------------------------- | ------------------------------------------- |
| 9918c31c9 | refactor(routing): sidebar の page nav を next/link ベースに移行 | Step 2: SidebarPageNav の Link 化           |
| dedc00dae | refactor(routing): bottom tab bar を next/link ベースに移行      | Step 3: BottomTabBar の Link 化             |
| b063b711e | fix(routing): view stats 遷移時に Inspector を閉じる             | 先行 fix: Inspector 自動 close              |
| 61c9071ec | fix(routing): inspector を calendar 外への遷移で閉じる           | 先行 fix: Calendar 外遷移時 Inspector close |
| ab5048a8c | refactor(routing): client page router を撤去                     | Step 4: ClientPageRouter 撤去 (本丸)        |
| 69e1df5cc | refactor(routing): noop となった resetToServer 呼び出しを撤去    | Step 5: resetToServer 撤去                  |
| 4192f2fe3 | refactor(routing): useClientRouterStore を削除                   | Step 6: useClientRouterStore 完全削除       |
| 64c116206 | test(e2e): phase 2-b の routing 変更に smoke test を追加         | Step 7: E2E regression guard 追加           |

## 変更規模

16 ファイル / +286 / -314 / **net -28 行**

## 技術的成果

- **Routing 統一**: `router.push` / `useClientRouterStore` / `pushState` の二重管理を撤去し、`<Link prefetch>` + `usePathname` の標準 App Router 経路に一本化
- **Dead code 削除**: `ClientPageRouter.tsx` および関連 store を完全撤去
- **SSR prefetch 復活**: 各 `page.tsx` の `prefetchCalendarData` / `prefetchStatsData` が撤去後に初めて実効的に機能
- **a11y 改善**: `SidebarPageNav` / `BottomTabBar` を `nav` + `aria-current` ベースへ
- **Inspector 自動 close 実装**: `resetToServer` noop 状態を撤去し、pathname 変化ベースの close dispatch に統一
- **E2E regression guard 構築**: `mode-switching` / `sidebar-persistence` smoke test を追加

## Phase 2-C (sidebar-3-mode-structure) への引き継ぎ

Phase 2-B 実施中に「**Sidebar は既に layout スコープで静止している**」ことが発見された (Step 4 detail §§3, 6 参照)。この発見は Phase 2-C で Option Y (pathname dispatch による `SidebarContent` モード分岐) を採用する根拠になった。`ClientPageRouter` が担っていた「Sidebar 静止」は Next.js partial rendering が自然に担保するため、モード分離は sidebar 側で pathname dispatch すれば十分という結論。

## 関連リンク

- 親 Plan: `docs/design/sidebar-redesign-plan.md` §8 Phase 2-B 実装プロンプト骨子
- Step 4 詳細設計: [step-4-detail.md](./step-4-detail.md)
- 後続 Project: `sidebar-3-mode-structure`
