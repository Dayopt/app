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
export { ColorPaletteMenuItems, getColorDisplayName } from './components/color-palette-picker';
export { IconPickerDropdownItems } from './components/IconPicker';
export { TagIcon } from './components/TagIcon';
export { TagQuickSelector } from './components/TagQuickSelector';
export type { HoveredTagInfo } from './components/TagQuickSelector';

// Tag color helpers
export {
  DEFAULT_GROUP_COLOR,
  DEFAULT_TAG_COLOR,
  TAG_COLOR_MAP,
  TAG_COLOR_NAMES,
  TAG_COLOR_PALETTE,
  TAG_DESCRIPTION_MAX_LENGTH,
  TAG_GROUP_NAME_MAX_LENGTH,
  TAG_NAME_MAX_LENGTH,
  getTagColorClasses,
  resolveTagColor,
} from './lib/tag-colors';
export type { TagColorEntry, TagColorName } from './lib/tag-colors';

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

// Domain
export { buildTagHierarchyUpdates, flattenTagTree } from './domain/tag-tree';

// Types
export type { Tag, TagTreeNode } from './types';

// ここにないものはfeature内部専用
