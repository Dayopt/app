/**
 * Tags Feature - Public API
 *
 * docs: docs/product/specs/tags.md
 *
 * タグ機能の統一的なエントリーポイント。
 * 外部からのインポートはこのファイル経由で行う。
 */

// Components
export {
  // Modals & Dialogs
  TagDeleteConfirmDialog,
} from './components';
export { ColorPaletteMenuItems } from './components/ColorPaletteMenuItems';
export { IconPickerDropdownItems } from './components/IconPicker';
export { TagIcon } from './components/TagIcon';
export { TagQuickSelector } from './components/TagQuickSelector';
export type { HoveredTagInfo } from './components/TagQuickSelector';

// Tag color helpers
export { getTagColorClasses, resolveTagColor } from './lib/tag-colors';
export type { TagColorEntry, TagColorName } from './lib/tag-colors';

// Hooks
export {
  tagKeys,
  useArchiveTag,
  useArchivedTags,
  useCreateTag,
  useDeleteTag,
  useMergeTag,
  useReorderTags,
  useRestoreTag,

  // Tags CRUD
  useTags,
  useTagsHierarchy,
  useTagsMap,
  useUpdateTag,
} from './hooks';

// Domain
export { buildTagHierarchyUpdates, flattenTagTree } from './domain/tag-tree';

// Types
export type { Tag, TagTreeNode } from './types';

// ここにないものはfeature内部専用
