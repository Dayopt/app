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
export { useCreateTag, useDeleteTag, useReorderTags, useUpdateTag } from './useTagCrudMutations';

// Tags Mutation Hooks (Merge)
export { useMergeTag } from './useTagMergeMutation';

// Tag Map
export { useTagsMap } from './useTagsMap';
