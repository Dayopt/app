import { getAllContent } from '@/lib/mdx';
import type { ContentData } from '@/types/content';
import { getTranslations } from 'next-intl/server';

export interface NavItem {
  name: string;
  href?: string;
  description?: string;
  items?: NavItem[];
}

export interface NavSection {
  name: string;
  items: NavItem[];
}

// Navigation types for docs sidebar
export interface NavigationItem {
  title: string;
  href?: string;
  items?: NavigationItem[];
  badge?: string;
  external?: boolean;
}

export interface NavigationSection {
  title: string;
  items: NavigationItem[];
}

/** nav に出すカテゴリーの表示順。ここに無いカテゴリーは末尾にアルファベット順で続く。 */
const CATEGORY_ORDER = [
  'getting-started',
  'features',
  'guides',
  'troubleshooting',
  'account',
  'faq',
] as const;

/** i18n キーが無いカテゴリーの fallback 表示名（kebab-case → Title Case） */
function toTitleCase(slug: string): string {
  return slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * docs ナビゲーションを実在コンテンツから生成する。
 *
 * `content/docs/{locale}/` に実在する mdx だけが nav に出るため、リンク切れ（404）が
 * 構造的に発生しない。コンテンツを追加・削除すれば nav に自動反映され、ハードコードした
 * placeholder リンクが drift する余地が無い。
 */
export async function generateDocsNavigation(locale: string): Promise<NavigationSection[]> {
  const allContent = await getAllContent(locale);
  const t = await getTranslations({ locale, namespace: 'docs' });

  // カテゴリー（トップレベルのディレクトリ）ごとにグループ化
  const byCategory = new Map<string, ContentData[]>();
  for (const content of allContent) {
    // トップレベル index.mdx は /docs ランディング自身なので nav から除外
    if (content.slug === 'index') continue;
    const items = byCategory.get(content.frontMatter.category) ?? [];
    items.push(content);
    byCategory.set(content.frontMatter.category, items);
  }

  // カテゴリーを表示順に並べる（CATEGORY_ORDER 優先、残りはアルファベット順）
  const orderedCategories = [...byCategory.keys()].sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a as (typeof CATEGORY_ORDER)[number]);
    const ib = CATEGORY_ORDER.indexOf(b as (typeof CATEGORY_ORDER)[number]);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });

  return orderedCategories.map((category) => {
    // getAllContent は category → order でソート済みなので push 順がそのまま order 昇順になる
    const contents = byCategory.get(category) ?? [];
    // カテゴリーの index.mdx は overview として先頭に固定（href は /docs/{category} に解決される）
    const indexContent = contents.find((c) => c.slug === `${category}/index`);
    const rest = contents.filter((c) => c.slug !== `${category}/index`);

    // getting-started の Overview だけは /docs（ドキュメントのトップ）自体に解決する。
    // /docs はデフォルトでこの Overview を表示するため、URL を二重化させずここに統一する。
    const isGettingStarted = category === 'getting-started';

    const items: NavigationItem[] = [];
    if (indexContent) {
      items.push({
        title: isGettingStarted ? t('overview') : indexContent.frontMatter.title,
        href: isGettingStarted ? '/docs' : `/docs/${category}`,
      });
    }
    for (const content of rest) {
      items.push({ title: content.frontMatter.title, href: `/docs/${content.slug}` });
    }

    const sectionTitle = t.has(`categories.${category}`)
      ? t(`categories.${category}`)
      : toTitleCase(category);

    return { title: sectionTitle, items };
  });
}
