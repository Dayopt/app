import { getAllContent } from '@web/lib/mdx';
import type { ContentData } from '@web/types/content';
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

/**
 * nav に出すカテゴリーの表示順。ここに無いカテゴリーは末尾にアルファベット順で続く。
 *
 * 第 1 階層は「ユーザーがやりたいこと」で並べる（計画する → 記録する → 振り返る）。
 * 画面名・機能名で切ると製品側の改名で陳腐化するため使わない。
 * 実在するカテゴリーだけが nav に出るので、ページの無い受け皿を書いても害はない。
 */
const CATEGORY_ORDER = [
  'getting-started',
  'plan',
  'track',
  'review',
  'organize',
  'data',
  'account',
  'troubleshooting',
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
 * カテゴリー配下のグループ名（第 2 階層のディレクトリ）を返す。直下のページは undefined。
 *
 * `plan/recurring/exceptions.mdx` なら `recurring`。URL は slug のままフラットなので、
 * ディレクトリはナビの構造だけを決める。深さは validate-content.js が 3 段までに制限する。
 */
function getGroup(content: ContentData): string | undefined {
  const segments = content.path.replaceAll('\\', '/').split('/');
  return segments.length > 2 ? segments[1] : undefined;
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
    // カテゴリー名と同じスラッグの記事（index.mdx 由来）は overview として先頭に固定
    const indexContent = contents.find((c) => c.slug === category);
    const rest = contents.filter((c) => c.slug !== category);

    // getting-started の Overview だけは /docs（ドキュメントのトップ）自体に解決する。
    // /docs はデフォルトでこの Overview を表示するため、URL を二重化させずここに統一する。
    const isGettingStarted = category === 'getting-started';

    const items: NavigationItem[] = [];
    if (indexContent) {
      items.push({
        title: isGettingStarted ? t('overview') : indexContent.frontMatter.title,
        href: isGettingStarted ? '/docs' : `/docs/${indexContent.slug}`,
      });
    }

    // サブディレクトリのページは第 3 階層としてグループにまとめる。
    // グループは最初に現れた位置に置き、グループ内の順序は order のまま維持する
    const groups = new Map<string, NavigationItem>();
    for (const content of rest) {
      const group = getGroup(content);
      const item: NavigationItem = {
        title: content.frontMatter.title,
        href: `/docs/${content.slug}`,
      };

      if (!group) {
        items.push(item);
        continue;
      }

      let groupItem = groups.get(group);
      if (!groupItem) {
        groupItem = {
          title: t.has(`categories.${group}`) ? t(`categories.${group}`) : toTitleCase(group),
          items: [],
        };
        groups.set(group, groupItem);
        items.push(groupItem);
      }

      // グループ名と同じスラッグのページはグループ自体のリンク先にする（カテゴリー overview と同じ扱い）
      if (content.slug === group) groupItem.href = item.href;
      else groupItem.items?.push(item);
    }

    const sectionTitle = t.has(`categories.${category}`)
      ? t(`categories.${category}`)
      : toTitleCase(category);

    return { title: sectionTitle, items };
  });
}
