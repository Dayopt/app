/**
 * Tags Feature - Public API
 *
 * タグ機能の統一的なエントリーポイント。
 * 外部からのインポートはこのファイル経由で行う。
 */

// Components
export {
  // Inline forms
  InlineTagCreateRow,
  InlineTagNameEdit,
  // Modals & Dialogs
  TagDeleteStrategyDialog,
} from './components';
export { IconPicker, IconPickerDropdownItems } from './components/IconPicker';
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
  useTagsMap,
  useUngroupTags,
  useUpdateTag,
} from './hooks';

// Lib
export { buildColonTagName, getTagDisplayLabel, parseColonTag } from './lib/tag-colon';

// Server (Service layer — server-only ガードで保護済み)
export { TagService } from './server/tag-service';

// Types
export type { Tag } from './types';

// ここにないものはfeature内部専用
