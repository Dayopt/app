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
export { TagQuickSelector } from './components/TagQuickSelector';
export { TagRadioItem } from './components/TagRadioItem';

// Hooks
export {
  tagKeys,
  useCreateTag,
  useDeleteTag,
  useOptimisticTagUpdate,
  useRenameTag,
  useTag,
  // Operations
  useTagOperations,
  // Realtime
  useTagRealtime,
  // Tags CRUD
  useTags,
  useUpdateTag,
  useUpdateTagColor,
} from './hooks';

// Stores
export { useTagCacheStore } from './stores/useTagCacheStore';

// Lib
export { buildColonTagName, getTagDisplayLabel, parseColonTag } from './lib/tag-colon';

// Merge mutation
export { useMergeTag } from './hooks/useTagMergeMutation';

// Tag map (lookup by ID)
export { useTagsMap } from './hooks/useTagsMap';
export type { TagInfo } from './hooks/useTagsMap';

// Additional CRUD mutations (used by calendar sidebar)
export {
  useDeleteGroup,
  useRenameGroup,
  useReorderTags,
  useUngroupTags,
} from './hooks/useTagCrudMutations';
export type { ReorderTagInput } from './hooks/useTagCrudMutations';

// Constants - Colors
export { DEFAULT_TAG_COLOR, TAG_COLOR_PALETTE } from '@/lib/tag-colors';

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
