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
  TagDeleteStrategyDialog,
} from './components';
export { ColorPaletteMenuItems } from './components/color-palette-picker';
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
  useCreateTag,
  useDeleteTag,
  useMergeTag,
  useReorderTags,

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
