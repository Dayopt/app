/**
 * Activities Feature - Public API
 *
 * migration: supabase/migrations/20260818120000_add_activity_category_tables.sql
 *
 * Category / Activity 機能の統一的なエントリーポイント。
 * 外部からのインポートはこのファイル経由で行う。
 *
 * server 層（router / service）は app-router.ts からのみ import する
 * （barrel から export しない）。
 */

// Types
export type { Activity, ActivityTree, Category, CategoryTreeNode } from './types';

// 表示部品（色・アイコンを持つのはカテゴリーだけ。アクティビティは継承する）
export { ActivityIcon } from './components/ActivityIcon';
export {
  CategoryColorMenuItems,
  CategoryIconMenuItems,
  getColorDisplayName,
} from './components/CategoryAppearanceMenuItems';

// 色・アイコンの解決
export {
  ACTIVITY_NAME_MAX_LENGTH,
  CATEGORY_COLOR_NAMES,
  DEFAULT_CATEGORY_COLOR,
  getCategoryColorClasses,
  resolveCategoryColor,
} from './lib/category-colors';
export type { CategoryColorEntry, CategoryColorName } from './lib/category-colors';

// 取得
export { useActivitiesMap } from './hooks/useActivitiesMap';
export type { ActivityDisplayInfo } from './hooks/useActivitiesMap';
export {
  useActivities,
  useActivityTree,
  useArchivedActivities,
  useArchivedCategories,
  useCategories,
} from './hooks/useActivitiesQuery';

// 更新（すべて楽観的更新つき）
export {
  useArchiveActivity,
  useCreateActivity,
  useDeleteActivity,
  useRestoreActivity,
  useUpdateActivity,
} from './hooks/useActivityMutations';
export {
  useArchiveCategory,
  useCreateCategory,
  useDeleteCategory,
  useRestoreCategory,
  useUpdateCategory,
} from './hooks/useCategoryMutations';

// tree の畳み込み（サイドバーのフィルター同期・同名衝突の検出に使う）
export {
  collectActivitiesFromTree,
  collectActivityIdsFromTree,
} from './domain/activity-tree-cache';

// ここにないものはfeature内部専用
