/**
 * blog のカテゴリ（タブ）定義。
 *
 * タブと URL の対応:
 * - all      → /blog
 * - それ以外 → /blog/{category}
 *
 * ラベルは i18n の `blog.tabs.{category}` を参照する。
 */
export const BLOG_CATEGORIES = ['all', 'guide', 'philosophy', 'release', 'devlog'] as const;
export type BlogCategory = (typeof BLOG_CATEGORIES)[number];

/** 'all' を除いた、URL セグメントになるカテゴリ key。 */
export const BLOG_CATEGORY_KEYS = BLOG_CATEGORIES.filter((c) => c !== 'all') as Exclude<
  BlogCategory,
  'all'
>[];

/** URL セグメント（/blog/{segment}）が既知のカテゴリ key かどうか。 */
export function isBlogCategoryKey(segment: string): segment is Exclude<BlogCategory, 'all'> {
  return (BLOG_CATEGORY_KEYS as string[]).includes(segment);
}

/** タブの href（all は /blog、それ以外は /blog/{category}）。 */
export function blogCategoryHref(category: BlogCategory): string {
  return category === 'all' ? '/blog' : `/blog/${category}`;
}
