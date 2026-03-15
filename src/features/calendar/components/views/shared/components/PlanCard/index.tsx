/**
 * @deprecated EntryCard (@/features/entry) を使用してください。
 * このファイルは後方互換性のための re-export です。
 */

export { EntryCard as PlanCard, EntryCardContent as PlanCardContent } from '@/features/entry';

// 後方互換性のためのエイリアス
export {
  EntryCard as EventBlock,
  EntryCardContent as EventContent,
  EntryCard as PlanBlock,
  EntryCard as planCard,
  EntryCardContent as planCardContent,
} from '@/features/entry';
