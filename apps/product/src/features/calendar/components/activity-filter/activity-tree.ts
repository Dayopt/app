/**
 * サイドバー IA のためのアクティビティ / カテゴリー分割。
 *
 * サイドバーは「カテゴリー見出し + 所属アクティビティ」を上に、
 * 「未分類（カテゴリー未所属のアクティビティ）」を下にフラットで並べる。
 * この配置に必要な形へ、サーバーから来る階層構造を 1 度だけ畳む。
 *
 * 並び順は名前順（`sort_order` は廃止。DnD 撤去の帰結）。
 * ロケール差で並びがぶれないよう、比較は `Intl.Collator` に固定する。
 */

import type { Tag, TagTreeNode } from '@/features/tags';

/** カテゴリー 1 件と、そこに所属するアクティビティ */
interface CategoryWithActivities {
  category: Tag;
  activities: Tag[];
}

/** サイドバーが描画するために必要な全体形 */
interface SidebarActivityModel {
  /** 名前順のカテゴリー群（各カテゴリー内のアクティビティも名前順） */
  categories: CategoryWithActivities[];
  /** カテゴリー未所属のアクティビティ（名前順） */
  uncategorizedActivities: Tag[];
  /**
   * カレンダーフィルターの同期対象になる全 ID。
   *
   * **カテゴリー ID も含める。** ブロックはカテゴリー（旧モデルの親タグ）を直接
   * 参照している場合があり、除外すると `syncWithActivities` の orphan 除去で
   * `visibleActivityIds` から消え、そのブロックがカレンダーから見えなくなる。
   * サイドバーにはカテゴリー自身の表示トグルが無いため復帰手段も無くなる。
   * `useCalendarData` 側の sync も同じ理由で全タグ ID を渡しており、集合を
   * 揃えないと「後から走った方」が相手の ID を orphan 除去してしまう。
   */
  allFilterableIds: string[];
  /** 「カテゴリーを変更」ピッカーに出す全アクティビティ（同名衝突の検出にも使う） */
  allActivities: Tag[];
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function byName(a: Tag, b: Tag): number {
  return collator.compare(a.name, b.name);
}

/**
 * 階層構造をサイドバーの 2 セクション構成へ畳む。
 *
 * 子を持つノードをカテゴリー、その子をアクティビティとして扱う。
 * 子を持たないルートノードは「カテゴリー未所属のアクティビティ」になる。
 */
export function partitionActivityTree(nodes: TagTreeNode[]): SidebarActivityModel {
  const categories: CategoryWithActivities[] = [];
  const uncategorizedActivities: Tag[] = [];

  for (const node of nodes) {
    if (node.children.length > 0) {
      categories.push({
        category: node.tag,
        activities: [...node.children].sort(byName),
      });
    } else {
      uncategorizedActivities.push(node.tag);
    }
  }

  categories.sort((a, b) => byName(a.category, b.category));
  uncategorizedActivities.sort(byName);

  const allActivities = [
    ...categories.flatMap((entry) => entry.activities),
    ...uncategorizedActivities,
  ];

  return {
    categories,
    uncategorizedActivities,
    allFilterableIds: [
      ...categories.map((entry) => entry.category.id),
      ...allActivities.map((activity) => activity.id),
    ],
    allActivities,
  };
}
