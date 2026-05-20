/**
 * Tags Feature - Public API
 *
 * タグ機能の統一的なエントリーポイント。
 * 外部からのインポートはこのファイル経由で行う。
 */

// Components
export {
  // Modals & Dialogs
  TagDeleteStrategyDialog,
} from './components';
export { IconPickerDropdownItems } from './components/IconPicker';
export { TagIcon } from './components/TagIcon';
export { TagQuickSelector } from './components/TagQuickSelector';
export type { HoveredTagInfo } from './components/TagQuickSelector';

// Hooks
export {
  tagKeys,
  useCreateTag,
  useDeleteTag,
  useMergeTag,
  useReorderTags,
  useTag,
  // Tags CRUD
  useTags,
  useTagsHierarchy,
  useTagsMap,
  useUpdateTag,
} from './hooks';

// Lib
export { buildTagHierarchyUpdates, flattenTagTree } from './lib/tag-tree';

// Types
export type { Tag, TagTreeNode } from './types';

// ここにないものはfeature内部専用
