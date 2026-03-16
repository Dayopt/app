/**
 * エントリ配置計算ユーティリティ
 *
 * @deprecated engine/layout.ts から直接importしてください。
 * このファイルは後方互換性のための re-export です。
 */

export {
  calculateEntryPosition,
  calculateEntryPositionWithCollapse,
  computeActualTimeDiffOverlay,
  detectOverlapGroups,
  entriesOverlap,
  filterEntriesByDate,
  sortTimedEntries,
} from '../../../../engine/layout';

export type { ActualTimeDiffOverlay } from '../../../../engine/layout';
