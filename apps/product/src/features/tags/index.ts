/**
 * Tags Feature - Public API
 *
 * docs: docs/product/specs/tags.md
 *
 * タグ機能の統一的なエントリーポイント。
 * 外部からのインポートはこのファイル経由で行う。
 */

// Components
export { TagIcon } from './components/TagIcon';
export { TagQuickSelector } from './components/TagQuickSelector';
export type { HoveredTagInfo } from './components/TagQuickSelector';

// Tag color helpers
export { getTagColorClasses, resolveTagColor } from './lib/tag-colors';
export type { TagColorEntry, TagColorName } from './lib/tag-colors';

// Hooks
export {
  useArchivedTags,
  useCreateTag,

  // Tags CRUD
  useTags,
  useTagsMap,
} from './hooks';

// Types
export type { Tag } from './types';

// ここにないものはfeature内部専用
