/**
 * Tags Hooks - Public API
 *
 * @example
 * ```tsx
 * import { useTags, useCreateTag } from '@/features/tags/hooks'
 * ```
 */

// Tags Query Keys
export { tagKeys } from './tagQueryKeys';

// Tags Query Hooks
export { useTag, useTags, useTagsHierarchy } from './useTagsQuery';

// Tags Mutation Hooks (CRUD)
export {
  useCreateTag,
  useDeleteGroup,
  useDeleteTag,
  useRenameGroup,
  useRenameTag,
  useReorderTags,
  useUngroupTags,
  useUpdateTag,
  useUpdateTagColor,
} from './useTagCrudMutations';
export type { ReorderTagInput } from './useTagCrudMutations';

// Tags Mutation Hooks (Merge)
export { useMergeTag } from './useTagMergeMutation';

// Tag Map
export { useTagsMap } from './useTagsMap';
export type { TagInfo } from './useTagsMap';

// Tags Optimistic Helpers (Legacy)
export { useOptimisticTagUpdate } from './useTagsOptimistic';

// Tag Operations
export { useTagOperations } from './useTagOperations';
