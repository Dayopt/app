/**
 * Tags Feature - Public API
 *
 * タグ機能の統一的なエントリーポイント。
 * 外部からのインポートはこのファイル経由で行う。
 */

// Components
export {
  GlobalTagCreateModal,
  TagCreateModal,
  // Modals & Dialogs
  TagDeleteStrategyDialog,
} from './components';
export { IconPicker } from './components/IconPicker';
export { TagGridPicker } from './components/TagGridPicker';
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
  useRenameTag,
  useReorderTags,
  useTag,
  // Operations
  useTagOperations,
  // Tags CRUD
  useTags,
  useTagsMap,
  useUngroupTags,
  useUpdateTag,
  useUpdateTagColor,
} from './hooks';
export type { ReorderTagInput, TagInfo } from './hooks';

// Lib
export { buildColonTagName, getTagDisplayLabel, parseColonTag } from './lib/tag-colon';

// Constants - Colors
export { DEFAULT_TAG_COLOR, TAG_COLOR_PALETTE } from '@/lib/tag-colors';

// Server (Service layer — for server-side consumers like ai feature)
export { TagService } from './server/tag-service';

// Types
export type {
  CreateTagInput,
  Tag,
  TagDeleteStrategy,
  TagFilter,
  TagOption,
  TagSortField,
  TagSortOptions,
  TagSortOrder,
  UpdateTagInput,
} from './types';
