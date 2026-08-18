/**
 * Tags Hooks - Public API
 *
 * @example
 * ```tsx
 * import { useTags, useCreateTag } from '@/features/tags/hooks'
 * ```
 */

// Tags Query Hooks
export { useTags } from './useTagsQuery';

// Tags Mutation Hooks (CRUD)
export { useCreateTag } from './useTagCrudMutations';

// Tags Mutation Hooks (Archive / Restore)
export { useArchivedTags } from './useTagArchiveMutations';

// Tag Map
export { useTagsMap } from './useTagsMap';
