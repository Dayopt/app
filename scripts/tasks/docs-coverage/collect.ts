/**
 * 機能 ⇄ 公開docs ⇄ LP の対応を集計する。
 *
 * 正本は docs/product/specs/。実装 PR ごとに spec を更新する既存の義務に相乗りするため、
 * 対応表を別ファイルで二重管理しない。spec の public_docs / lp を軸に、実ファイルと
 * LP の文言を突き合わせる。
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

export const LOCALES = ['en', 'ja'] as const;

/** URL を階層化するカテゴリ。apps/web/src/lib/mdx.ts の NESTED_URL_CATEGORIES と対にする */
const NESTED_URL_CATEGORIES: readonly string[] = ['faq'];
export type Locale = (typeof LOCALES)[number];

/** 公開docsページの状態。placeholder は「ページはあるが本文が未執筆」。 */
export type DocState = 'published' | 'draft' | 'placeholder' | 'missing';

export interface SpecEntry {
  /** docs/product/specs/ からの相対 path（拡張子なし） */
  name: string;
  publicDocs: readonly string[];
  /** public_docs / lp を書いていない spec はレジストリ未登録として扱う */
  registered: boolean;
  lp: readonly string[];
}

export interface DocEntry {
  slug: string;
  locale: Locale;
  /** apps/web/content/docs からの相対 path */
  path: string;
  state: Exclude<DocState, 'missing'>;
  /** frontmatter `generic: true`。特定 spec に紐づかない汎用ページ（faq / getting-started 等）を明示 */
  generic: boolean;
}

export interface CoverageRow {
  spec: string;
  slug: string;
  states: Record<Locale, DocState>;
  lp: readonly string[];
}

export interface Coverage {
  rows: readonly CoverageRow[];
  /** public_docs / lp 未記入の spec */
  unregisteredSpecs: readonly string[];
  /** どの spec の public_docs にも現れない実ファイル（frontmatter generic: true 以外） */
  orphanDocs: readonly DocEntry[];
  /** どの spec にも紐づかないが frontmatter generic: true で意図的に spec 外と明示された実ファイル */
  genericDocs: readonly DocEntry[];
  /** どの spec の lp にも対応しない LP の約束 */
  unbackedLpClaims: readonly string[];
  /** spec が lp に書いているが LP には無い文言（LP 側の変更で取り残された記述） */
  staleLpClaims: readonly { spec: string; claim: string }[];
}

function listMarkdown(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  for (const item of readdirSync(dir)) {
    const full = join(dir, item);
    if (statSync(full).isDirectory()) results.push(...listMarkdown(full));
    else if (item.endsWith('.md') || item.endsWith('.mdx')) results.push(full);
  }
  return results;
}

/** frontmatter から scalar と単純な文字列配列だけを読む（docs-guard と同じ最小実装）。 */
function readFrontmatter(content: string): Map<string, string | string[]> {
  const fields = new Map<string, string | string[]>();
  const match = /^---\n([\s\S]*?)\n---/.exec(content);
  if (!match?.[1]) return fields;

  let currentKey: string | undefined;
  for (const line of match[1].split('\n')) {
    if (line.trim().startsWith('#')) continue;

    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item?.[1] !== undefined && currentKey) {
      const value = unquote(item[1]);
      const existing = fields.get(currentKey);
      fields.set(currentKey, Array.isArray(existing) ? [...existing, value] : [value]);
      continue;
    }

    const pair = /^(\w+):\s*(.*)$/.exec(line);
    if (!pair?.[1]) continue;
    currentKey = pair[1];
    const raw = (pair[2] ?? '').trim();
    if (raw === '') fields.set(currentKey, []);
    else if (raw === '[]') fields.set(currentKey, []);
    else fields.set(currentKey, unquote(raw));
  }
  return fields;
}

function unquote(value: string): string {
  const trimmed = value.replace(/\s+#.*$/, '').trim();
  const quote = trimmed.at(0);
  if ((quote === "'" || quote === '"') && trimmed.at(-1) === quote && trimmed.length >= 2) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function asList(value: string | string[] | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value : [value];
}

export function collectSpecs(specsDir: string): SpecEntry[] {
  return listMarkdown(specsDir)
    .sort()
    .map((file) => {
      const fields = readFrontmatter(readFileSync(file, 'utf8'));
      const publicDocs = asList(fields.get('public_docs'));
      const lp = asList(fields.get('lp'));
      return {
        name: basename(file, '.md'),
        publicDocs: publicDocs ?? [],
        lp: lp ?? [],
        registered: publicDocs !== undefined,
      };
    });
}

export function collectDocs(docsDir: string): DocEntry[] {
  const entries: DocEntry[] = [];
  for (const locale of LOCALES) {
    const dir = join(docsDir, locale);
    for (const file of listMarkdown(dir).sort()) {
      const rel = relative(dir, file).replaceAll('\\', '/');
      const name = basename(file, '.mdx');
      // routing の slug はファイル名由来（index.mdx はカテゴリ名）。apps/web/src/lib/mdx.ts と同じ規則。
      // NESTED_URL_CATEGORIES のカテゴリだけ `<category>/<name>` になる
      const category = rel.split('/')[0] ?? name;
      const slug =
        name === 'index'
          ? category
          : NESTED_URL_CATEGORIES.includes(category)
            ? `${category}/${name}`
            : name;
      const fields = readFrontmatter(readFileSync(file, 'utf8'));
      const isDraft = fields.get('draft') === 'true';
      const isPlaceholder = fields.get('placeholder') === 'true';
      const isGeneric = fields.get('generic') === 'true';
      entries.push({
        slug,
        locale,
        path: rel,
        state: isPlaceholder ? 'placeholder' : isDraft ? 'draft' : 'published',
        generic: isGeneric,
      });
    }
  }
  return entries;
}

/** LP が約束している機能の文言（Free の features と Pro の highlights）。 */
export function collectLpClaims(marketingJson: string): string[] {
  const parsed: unknown = JSON.parse(readFileSync(marketingJson, 'utf8'));
  const plans = (parsed as Record<string, Record<string, Record<string, unknown>>>)?.marketing
    ?.pricing?.plans;
  if (!plans || typeof plans !== 'object') return [];

  const claims: string[] = [];
  for (const plan of Object.values(plans as Record<string, Record<string, unknown>>)) {
    for (const key of ['features', 'highlights']) {
      const list = plan[key];
      if (Array.isArray(list))
        claims.push(...list.filter((v): v is string => typeof v === 'string'));
    }
  }
  return claims;
}

export function buildCoverage(
  specs: readonly SpecEntry[],
  docs: readonly DocEntry[],
  lpClaims: readonly string[],
): Coverage {
  const byLocaleSlug = new Map(docs.map((doc) => [`${doc.locale}:${doc.slug}`, doc]));
  const claimedSlugs = new Set(specs.flatMap((spec) => spec.publicDocs));
  const claimedLp = new Map<string, string>();
  for (const spec of specs) for (const claim of spec.lp) claimedLp.set(claim, spec.name);

  const rows: CoverageRow[] = [];
  for (const spec of specs) {
    for (const slug of spec.publicDocs) {
      rows.push({
        spec: spec.name,
        slug,
        states: {
          en: byLocaleSlug.get(`en:${slug}`)?.state ?? 'missing',
          ja: byLocaleSlug.get(`ja:${slug}`)?.state ?? 'missing',
        },
        lp: spec.lp,
      });
    }
  }

  return {
    rows,
    unregisteredSpecs: specs.filter((spec) => !spec.registered).map((spec) => spec.name),
    orphanDocs: docs.filter((doc) => !claimedSlugs.has(doc.slug) && !doc.generic),
    genericDocs: docs.filter((doc) => !claimedSlugs.has(doc.slug) && doc.generic),
    unbackedLpClaims: lpClaims.filter((claim) => !claimedLp.has(claim)),
    staleLpClaims: specs.flatMap((spec) =>
      spec.lp
        .filter((claim) => !lpClaims.includes(claim))
        .map((claim) => ({ spec: spec.name, claim })),
    ),
  };
}
