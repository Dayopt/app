'use client';

/**
 * Calendar タブの Sidebar 本体（Composition Layer、スクロール領域）
 *
 * view switcher + tag filter + テンプレート。MiniCalendar は Sidebar の pinned 領域
 * （プロフィール直上）へ移動した（#2217）。中身は書き換えない（旧 docs/projects/
 * _archive/workspace-shell-restructure/overview.md §5-2、docs/projects 全廃に伴い
 * #2473 で削除。git 履歴参照）。
 *
 * 表示順は「カテゴリ → テンプレート → 未分類」（2026-09-03 User 指示）。
 * テンプレートはカテゴリー樹とは別枠のフラットな一覧で、カテゴリーへの
 * 入れ子はしない（#2411 §5.1）。順序だけを ActivityFilterList の
 * `betweenCategoriesAndUncategorized` slot で差し込む。
 *
 * データは未配線（`plan_templates` 相当のテーブルと tRPC router は未実装）。
 * 現状は常に空状態を表示し、保存・適用の導線は後続の実装 issue（#2567）で配線する。
 */

import type { TemplateMock } from '@/features/calendar';
import { ActivityFilterList, TemplateList, ViewSwitcherList } from '@/features/calendar';

/** 未配線のため空配列を定数に固定する（毎 render で新しい参照を作らない） */
const EMPTY_TEMPLATES: ReadonlyArray<TemplateMock> = [];

export function CalendarSidebar() {
  return (
    <div className="flex min-w-0 flex-col gap-2 overflow-hidden px-2">
      <ViewSwitcherList />
      <ActivityFilterList
        betweenCategoriesAndUncategorized={<TemplateList templates={EMPTY_TEMPLATES} />}
      />
    </div>
  );
}
