import { rangesOverlap } from '@/lib/time';
import type { QueryClient } from '@tanstack/react-query';

interface TimeblockLaneItem {
  id: string;
  start_at: string;
  end_at: string;
}

/** 指定レーンの list cache query を判定する predicate（tRPC v11 key 形式）。 */
function isLaneListQuery(lane: 'plans' | 'records') {
  return (query: { queryKey: unknown }): boolean => {
    const key = query.queryKey;
    return (
      Array.isArray(key) && Array.isArray(key[0]) && key[0][0] === lane && key[0][1] === 'list'
    );
  };
}

/** cache 済みの plans.list / records.list から重複判定用の行を id 重複なしで集める。 */
export function collectTimeblockLaneItems(
  queryClient: QueryClient,
  lane: 'plans' | 'records',
): TimeblockLaneItem[] {
  const lists = queryClient.getQueriesData<TimeblockLaneItem[]>({
    predicate: isLaneListQuery(lane),
  });
  const seen = new Set<string>();
  const items: TimeblockLaneItem[] = [];
  for (const [, data] of lists) {
    if (!data) continue;
    for (const row of data) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      items.push(row);
    }
  }
  return items;
}

/**
 * 同一レーンの時間重複を判定する。
 * 半開区間で判定し、編集中の行は excludeId で除外する。
 */
export function hasTimeblockLaneConflict(
  items: TimeblockLaneItem[],
  startAt: Date,
  endAt: Date,
  excludeId?: string,
): boolean {
  return items.some(
    (item) => item.id !== excludeId && rangesOverlap(startAt, endAt, item.start_at, item.end_at),
  );
}
