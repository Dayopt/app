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

// Tag color helpers
export { getTagColorClasses, resolveTagColor } from './lib/tag-colors';
export type { TagColorName } from './lib/tag-colors';

// Hooks
export { useTagsMap } from './hooks';

// ここにないものはfeature内部専用
