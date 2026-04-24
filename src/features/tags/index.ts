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
export { CreateTagPopover } from './components/CreateTagPopover';
export type {
  CreateTagPopoverProps,
  CreateTagPopoverSubmitInput,
} from './components/CreateTagPopover';
export { IconPicker, IconPickerDropdownItems } from './components/IconPicker';
export { RenameTagPopover } from './components/RenameTagPopover';
export type { RenameTagPopoverProps } from './components/RenameTagPopover';
export { TagIcon } from './components/TagIcon';
export { TagQuickSelector } from './components/TagQuickSelector';
export type { HoveredTagInfo } from './components/TagQuickSelector';

// Hooks
export {
  tagKeys,
  useCreateTag,
  useDeleteGroup,
  useDeleteTag,
  useMergeTag,
  useRenameGroup,
  useReorderTags,
  useTag,
  // Tags CRUD
  useTags,
  useTagsHierarchy,
  useTagsMap,
  useUngroupTags,
  useUpdateTag,
} from './hooks';

// Lib
export { buildColonTagName, getTagDisplayLabel, parseColonTag } from './lib/tag-colon';
export { buildTagHierarchyUpdates, buildTagTree, flattenTagTree } from './lib/tag-tree';

// Server (Service layer — server-only ガードで保護済み)
export { TagService } from './server/tag-service';

// Types
export type { Tag, TagTreeNode } from './types';

// ここにないものはfeature内部専用
