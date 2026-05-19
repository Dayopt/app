import {
  type ReleaseFrontMatter as ReleaseFrontMatterType,
  parseFrontMatter,
  releaseFrontMatterSchema,
} from '@/lib/content-schemas';
import { calculateReadingTime } from '@/lib/utils';
import fs from 'fs';
import matter from 'gray-matter';
import path from 'path';
import { cache } from 'react';

export type ReleaseFrontMatter = ReleaseFrontMatterType;

export interface ReleasePostMeta {
  frontMatter: ReleaseFrontMatter;
  slug: string;
  content: string;
  readingTime: number;
}

export type ReleasePostMetaClient = Omit<ReleasePostMeta, 'content'>;

export interface ReleasePost {
  frontMatter: ReleaseFrontMatter;
  content: string;
  slug: string;
  readingTime: number;
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface ChangeType {
  id: string;
  label: string;
  icon: string;
  color: string;
}

// 変更タイプの定義 - セマンティックカラー使用
export const changeTypes: ChangeType[] = [
  {
    id: 'new-features',
    label: 'New Features',
    icon: '🎉',
    color: 'bg-muted text-success border-success',
  },
  {
    id: 'improvements',
    label: 'Improvements',
    icon: '🔧',
    color: 'bg-muted text-info border-info',
  },
  {
    id: 'bug-fixes',
    label: 'Bug Fixes',
    icon: '🐛',
    color: 'bg-muted text-warning border-warning',
  },
  {
    id: 'breaking-changes',
    label: 'Breaking Changes',
    icon: '⚠️',
    color: 'bg-muted text-destructive border-destructive',
  },
  {
    id: 'security-updates',
    label: 'Security Updates',
    icon: '🔒',
    color: 'bg-muted text-primary border-primary',
  },
];

const RELEASES_BASE_DIR = path.join(process.cwd(), 'content', 'releases');

/**
 * ロケールを考慮したリリースディレクトリパスを取得
 */
function getReleasesDir(locale?: string): string {
  if (locale) {
    return path.join(RELEASES_BASE_DIR, locale);
  }
  return RELEASES_BASE_DIR;
}

// セマンティックバージョニングでソート
export function sortVersions(versions: string[]): string[] {
  return versions.sort((a, b) => {
    const parseVersion = (version: string) => {
      const cleanVersion = version.replace(/^v/, ''); // "v"プレフィックスを削除
      const parts = cleanVersion.split('.').map(Number);
      return {
        major: parts[0] || 0,
        minor: parts[1] || 0,
        patch: parts[2] || 0,
      };
    };

    const versionA = parseVersion(a);
    const versionB = parseVersion(b);

    if (versionA.major !== versionB.major) {
      return versionB.major - versionA.major; // 降順
    }
    if (versionA.minor !== versionB.minor) {
      return versionB.minor - versionA.minor;
    }
    return versionB.patch - versionA.patch;
  });
}

// リリース読了時間の計算（utils.tsの統一関数を使用）
export function calculateReleaseTime(content: string): number {
  return calculateReadingTime(content);
}

// 全てのリリースノートメタデータを取得（cache()で同一リクエスト内の重複呼び出しを排除）
export const getAllReleaseMetas = cache(async function getAllReleaseMetasImpl(
  locale?: string,
): Promise<ReleasePostMeta[]> {
  const releasesDirectory = getReleasesDir(locale);

  try {
    if (!fs.existsSync(releasesDirectory)) {
      console.warn(`[Releases] Releases directory not found: ${releasesDirectory}`);
      return [];
    }

    let filenames: string[];
    try {
      filenames = fs.readdirSync(releasesDirectory);
    } catch (error) {
      console.error(`[Releases] Failed to read releases directory: ${releasesDirectory}`, error);
      return [];
    }

    const mdxFiles = filenames.filter((name) => name.endsWith('.mdx'));
    const releases: ReleasePostMeta[] = [];
    const errors: { file: string; error: unknown }[] = [];

    for (const filename of mdxFiles) {
      const filePath = path.join(releasesDirectory, filename);
      try {
        const fileContents = fs.readFileSync(filePath, 'utf8');
        const { data, content } = matter(fileContents);

        const frontMatter = parseFrontMatter(releaseFrontMatterSchema, data, filePath);

        const slug = filename.replace(/\.mdx$/, '');
        const readingTime = calculateReleaseTime(content);

        releases.push({
          frontMatter,
          slug,
          content,
          readingTime,
        });
      } catch (error) {
        errors.push({ file: filePath, error });
      }
    }

    // Log any errors that occurred during processing
    if (errors.length > 0) {
      console.error(`[Releases] Failed to process ${errors.length} release note(s):`);
      errors.forEach(({ file, error }) => {
        console.error(`  - ${file}:`, error instanceof Error ? error.message : error);
      });
    }

    // バージョンでソート（最新が最初）
    releases.sort((a, b) => {
      const versionA = a.frontMatter.version || '';
      const versionB = b.frontMatter.version || '';
      const versions = [versionA, versionB];
      const sorted = sortVersions(versions);
      return sorted.indexOf(versionA) - sorted.indexOf(versionB);
    });

    return releases;
  } catch (error) {
    console.error('[Releases] Unexpected error in getAllReleaseMetas:', error);
    return [];
  }
});

// 個別リリースノート取得
export async function getRelease(version: string, locale?: string): Promise<ReleasePost | null> {
  // Validate version to prevent path traversal
  if (!version || version.includes('..') || version.includes('/')) {
    console.warn(`[Releases] Invalid version provided: ${version}`);
    return null;
  }

  const releasesDirectory = getReleasesDir(locale);
  const filePath = path.join(releasesDirectory, `${version}.mdx`);

  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const fileContents = fs.readFileSync(filePath, 'utf8');
    const { data, content } = matter(fileContents);

    const frontMatter = parseFrontMatter(releaseFrontMatterSchema, data, filePath);
    const readingTime = calculateReleaseTime(content);

    return {
      frontMatter,
      content,
      slug: version,
      readingTime,
    };
  } catch (error) {
    console.error(
      `[Releases] Failed to read release: ${filePath}`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

// タグ別リリースノート取得
export async function getReleasesByTag(tag: string, locale?: string): Promise<ReleasePostMeta[]> {
  const allReleases = await getAllReleaseMetas(locale);
  return allReleases.filter((release) => release.frontMatter.tags.includes(tag));
}

// 全タグとその数を取得
export async function getAllReleaseTags(locale?: string): Promise<TagCount[]> {
  const allReleases = await getAllReleaseMetas(locale);
  const tagCounts = new Map<string, number>();

  allReleases.forEach((release) => {
    release.frontMatter.tags.forEach((tag) => {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    });
  });

  return Array.from(tagCounts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

// 注目リリース取得
export async function getFeaturedReleases(locale?: string): Promise<ReleasePostMeta[]> {
  const allReleases = await getAllReleaseMetas(locale);
  return allReleases.filter((release) => release.frontMatter.featured);
}

// 関連リリース取得
export async function getRelatedReleases(
  currentVersion: string,
  limit: number = 3,
  locale?: string,
): Promise<ReleasePostMeta[]> {
  const allReleases = await getAllReleaseMetas(locale);
  const currentRelease = allReleases.find((r) => r.frontMatter.version === currentVersion);

  if (!currentRelease) {
    return [];
  }

  // タグベースでの関連性スコア計算
  const relatedReleases = allReleases
    .filter((release) => release.frontMatter.version !== currentVersion)
    .map((release) => {
      const commonTags = release.frontMatter.tags.filter((tag) =>
        currentRelease.frontMatter.tags.includes(tag),
      );

      return {
        ...release,
        score: commonTags.length,
      };
    })
    .filter((release) => release.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return relatedReleases.map(({ score: _score, ...release }) => release);
}

// リリースノート検索
export async function searchReleases(query: string, locale?: string): Promise<ReleasePostMeta[]> {
  const allReleases = await getAllReleaseMetas(locale);
  const lowercaseQuery = query.toLowerCase();

  return allReleases.filter((release) => {
    const searchText = [
      release.frontMatter.title,
      release.frontMatter.description,
      release.frontMatter.version,
      ...release.frontMatter.tags,
      release.content,
    ]
      .join(' ')
      .toLowerCase();

    return searchText.includes(lowercaseQuery);
  });
}

// プレリリース・ベータ版の判定
export function isPrerelease(version: string): boolean {
  return (
    version.includes('beta') ||
    version.includes('alpha') ||
    version.includes('rc') ||
    version.includes('pre')
  );
}

// バージョンタイプの判定
export function getVersionType(version: string): 'major' | 'minor' | 'patch' | 'prerelease' {
  if (isPrerelease(version)) {
    return 'prerelease';
  }

  const cleanVersion = version.replace(/^v/, '');
  const parts = cleanVersion.split('.').map(Number);

  if ((parts[2] ?? 0) > 0) return 'patch';
  if ((parts[1] ?? 0) > 0) return 'minor';
  return 'major';
}

// リリースタイムライン生成
export function generateReleaseTimeline(releases: ReleasePostMeta[]): {
  year: string;
  months: {
    month: string;
    releases: ReleasePostMeta[];
  }[];
}[] {
  const timeline = new Map<string, Map<string, ReleasePostMeta[]>>();

  releases.forEach((release) => {
    const date = new Date(release.frontMatter.date);
    const year = date.getFullYear().toString();
    const month = date.toLocaleDateString('ja-JP', { month: 'long' });

    if (!timeline.has(year)) {
      timeline.set(year, new Map());
    }

    const yearMap = timeline.get(year)!;
    if (!yearMap.has(month)) {
      yearMap.set(month, []);
    }

    yearMap.get(month)!.push(release);
  });

  return Array.from(timeline.entries())
    .map(([year, monthsMap]) => ({
      year,
      months: Array.from(monthsMap.entries())
        .map(([month, releases]) => ({ month, releases }))
        .sort((a, b) => {
          const monthOrder = [
            'January',
            'February',
            'March',
            'April',
            'May',
            'June',
            'July',
            'August',
            'September',
            'October',
            'November',
            'December',
          ];
          return monthOrder.indexOf(b.month) - monthOrder.indexOf(a.month);
        }),
    }))
    .sort((a, b) => parseInt(b.year) - parseInt(a.year));
}
