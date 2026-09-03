import type { Activity } from '@/features/activities';

import type { ActivitySortKey } from '../../stores/useActivitySortStore';

/** `statistics.getActivityStats` の `lastUsed`（activityId → ISO 日時） */
type ActivityLastUsedMap = Record<string, string>;

const collator = new Intl.Collator();

/**
 * サイドバーのアクティビティ一覧を並べる。
 *
 * サーバーの `listTree` は常に名前順で返す。ここは「見せ方」だけを変える層で、
 * 順序をサーバーへ保存しには行かない（`sort_order` は持たない、#2162）。
 *
 * `lastUsed` 順の時の同着・欠損の扱い:
 * - **一度も使っていないアクティビティは末尾**へ回す。0 件のものが「最終
 *   アクティビティが古い」扱いで上位に混ざると、よく使うものを上げるという
 *   目的が壊れる
 * - 使用日時が同じもの同士、および未使用同士は**名前順**で決める。比較関数が
 *   0 を返す組があると並びが実行ごとに揺れうるので、必ず全順序にする
 */
export function sortActivities(
  activities: readonly Activity[],
  sortKey: ActivitySortKey,
  lastUsed: ActivityLastUsedMap,
): Activity[] {
  const byName = (a: Activity, b: Activity) => collator.compare(a.name, b.name);

  if (sortKey === 'name') return [...activities].sort(byName);

  return [...activities].sort((a, b) => {
    const aLastUsed = lastUsed[a.id];
    const bLastUsed = lastUsed[b.id];

    // 未使用は末尾。未使用同士は名前順
    if (aLastUsed == null && bLastUsed == null) return byName(a, b);
    if (aLastUsed == null) return 1;
    if (bLastUsed == null) return -1;

    // 新しいものが上
    if (aLastUsed !== bLastUsed) return aLastUsed < bLastUsed ? 1 : -1;
    return byName(a, b);
  });
}
