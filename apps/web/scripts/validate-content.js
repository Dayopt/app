#!/usr/bin/env node
/**
 * コンテンツ（MDX）フロントマター バリデーションスクリプト
 *
 * 使用方法:
 *   pnpm validate:content
 *
 * 判定基準:
 *   - draft: false のファイル → エラー（CI で失敗させる）
 *   - draft: true のファイル → 警告のみ（下書き中のため許容）
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.join(__dirname, '..', 'content');
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// ─── 必須フィールド定義 ─────────────────────────────────────

const REQUIRED_FIELDS = {
  blog: ['title', 'description', 'publishedAt', 'tags', 'category', 'author'],
  docs: ['title', 'description', 'category', 'slug'],
  legal: ['title', 'description', 'lastUpdated'],
};

const DATE_FIELDS = {
  blog: ['publishedAt', 'updatedAt'],
  docs: ['publishedAt', 'updatedAt'],
  legal: [],
};

export const REQUIRED_LEGAL_DOCUMENTS = [
  'cookies.mdx',
  'privacy.mdx',
  'security.mdx',
  'terms.mdx',
  'tokushoho.mdx',
];

// ─── フロントマターパーサー ─────────────────────────────────

function parseInlineArray(rawValue) {
  const inner = rawValue.slice(1, -1).trim();
  if (inner === '') return [];
  return inner
    .split(',')
    .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
    .filter((item) => item !== '');
}

// `tags: [] # comment` のような行末インラインコメントを除去する。
// クォート済み値は閉じクォートより後ろだけをコメット扱いにし、
// クォート内の '#' を誤って切り落とさない。
function stripInlineComment(rawValue) {
  const quoteChar = rawValue[0];
  if (quoteChar === "'" || quoteChar === '"') {
    const closingIndex = rawValue.indexOf(quoteChar, 1);
    if (closingIndex !== -1) {
      return rawValue.slice(0, closingIndex + 1);
    }
    return rawValue;
  }
  const commentIndex = rawValue.search(/\s#/);
  return commentIndex === -1 ? rawValue : rawValue.slice(0, commentIndex).trim();
}

export function parseFrontMatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { data: {}, body: content };

  const yaml = match[1];
  const data = {};
  const lines = yaml.split('\n');
  let currentKey = null;
  let arrayMode = false;
  const arrayValues = {};

  for (const line of lines) {
    if (line.trim().startsWith('#')) continue;

    // 配列要素
    if (/^\s+-\s/.test(line)) {
      const value = stripInlineComment(line.replace(/^\s+-\s/, '').trim()).replace(
        /^['"]|['"]$/g,
        '',
      );
      if (currentKey && arrayMode) {
        if (!arrayValues[currentKey]) arrayValues[currentKey] = [];
        arrayValues[currentKey].push(value);
        data[currentKey] = arrayValues[currentKey];
      }
      continue;
    }

    // ネストオブジェクト（ai など、2スペース以上インデント）はスキップ
    if (/^\s{2,}\w/.test(line)) continue;

    const keyValueMatch = line.match(/^(\w+):\s*(.*)/);
    if (keyValueMatch) {
      currentKey = keyValueMatch[1];
      const rawValue = stripInlineComment(keyValueMatch[2].trim());
      arrayMode = false;

      if (rawValue === '' || rawValue === null) {
        arrayMode = true;
        data[currentKey] = null;
      } else if (rawValue === 'true') {
        data[currentKey] = true;
      } else if (rawValue === 'false') {
        data[currentKey] = false;
      } else if (rawValue === 'null') {
        data[currentKey] = null;
      } else if (!Number.isNaN(Number(rawValue)) && rawValue !== '') {
        data[currentKey] = Number(rawValue);
      } else if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
        data[currentKey] = parseInlineArray(rawValue);
      } else {
        data[currentKey] = rawValue.replace(/^['"]|['"]$/g, '');
      }
    }
  }

  return { data, body: content.slice(match[0].length) };
}

// ─── バリデーション ─────────────────────────────────────────

// blog カテゴリ taxonomy。正は src/features/blog/lib/categories.ts の BLOG_CATEGORIES
// （このスクリプトは素の Node 実行のため TS を import できず、値を複製する。変更時は両方を更新する）
const BLOG_CATEGORIES = ['guide', 'philosophy', 'release', 'devlog'];
// カテゴリ key は /blog/<key> を一覧 URL として占有するため、記事 slug（ファイル名）に使えない。
// blog/[slug]/page.tsx はカテゴリ判定が先勝ちし、同名記事は静かに不可視になる
const RESERVED_BLOG_SLUGS = ['all', ...BLOG_CATEGORIES];

export function validateFrontMatter(fm, type, isDraft) {
  const errors = [];
  const warnings = [];
  const report = type === 'legal' || !isDraft ? errors : warnings;

  for (const field of REQUIRED_FIELDS[type]) {
    const value = fm[field];
    const isMissing =
      value === undefined ||
      value === null ||
      value === '' ||
      (Array.isArray(value) && value.length === 0);
    if (isMissing) {
      report.push(`Missing required field: '${field}'`);
    }
  }

  if (type === 'legal') {
    for (const field of Object.keys(fm)) {
      if (!REQUIRED_FIELDS.legal.includes(field)) {
        report.push(`Unexpected legal frontmatter field: '${field}'`);
      }
    }
  }

  for (const field of DATE_FIELDS[type] || []) {
    const val = fm[field];
    if (val && typeof val === 'string' && !DATE_PATTERN.test(val)) {
      report.push(`Invalid date format for '${field}': expected YYYY-MM-DD, got '${val}'`);
    }
  }

  if (type === 'blog' && fm.category && !BLOG_CATEGORIES.includes(fm.category)) {
    report.push(`Unknown blog category '${fm.category}' (allowed: ${BLOG_CATEGORIES.join(', ')})`);
  }

  if (type !== 'docs' && type !== 'legal') {
    const tags = fm.tags;
    if (Array.isArray(tags)) {
      // release カテゴリのタグは new-features/improvements/bug-fixes/breaking-changes/security-updates
      // という固定5分類（docs/operations/runbook.md 第4部）で、該当する分だけ付ける。
      // 1-2個でも正当なため、3個以上を強制する下限チェックは自由記述タグの blog 記事にのみ適用する。
      if (type === 'blog' && fm.category !== 'release' && tags.length > 0 && tags.length < 3) {
        report.push(`Too few tags (min: 3, found: ${tags.length})`);
      }
      if (tags.length > 6) {
        report.push(`Too many tags (max: 6, found: ${tags.length})`);
      }
    }
  }

  // placeholder（本文が未執筆の骨格）は必ず draft でなければならない。
  // 別製品のテンプレートがそのまま公開されていた事故（2026-07-24 監査）の再発防止で、
  // isDraft による warning 降格を通さず常に error にする
  if (fm.placeholder === true && fm.draft !== true) {
    errors.push(`'placeholder: true' requires 'draft: true' (未執筆ページは公開できない)`);
  }

  if (type !== 'legal' && !fm.ai) {
    warnings.push(`'ai' metadata not set (recommended for RAG)`);
  }

  return { errors, warnings };
}

export function validateLegalBody(body) {
  return body.trim() ? [] : ['Legal document content must not be empty'];
}

// ─── ファイルスキャン ───────────────────────────────────────

function findMdxFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const item of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...findMdxFiles(fullPath));
    } else if (item.endsWith('.mdx') || item.endsWith('.md')) {
      results.push(fullPath);
    }
  }
  return results;
}

// ─── 言語対称性チェック ─────────────────────────────────────

function checkLanguageSymmetry(type) {
  const issues = [];
  const enDir = path.join(CONTENT_DIR, type, 'en');
  const jaDir = path.join(CONTENT_DIR, type, 'ja');

  if (!fs.existsSync(enDir) || !fs.existsSync(jaDir)) return issues;

  const enFiles = findMdxFiles(enDir).map((f) => path.relative(enDir, f).replace(/\\/g, '/'));
  const jaFiles = new Set(
    findMdxFiles(jaDir).map((f) => path.relative(jaDir, f).replace(/\\/g, '/')),
  );

  for (const enFile of enFiles) {
    if (!jaFiles.has(enFile)) {
      issues.push(`Missing ja counterpart: content/${type}/en/${enFile}`);
    }
  }

  if (type === 'legal') {
    const enFileSet = new Set(enFiles);
    for (const jaFile of jaFiles) {
      if (!enFileSet.has(jaFile)) {
        issues.push(`Missing en counterpart: content/${type}/ja/${jaFile}`);
      }
    }
  }

  return issues;
}

function checkRequiredLegalDocuments() {
  const errors = [];
  for (const locale of ['en', 'ja']) {
    const localeDir = path.join(CONTENT_DIR, 'legal', locale);
    for (const file of REQUIRED_LEGAL_DOCUMENTS) {
      if (!fs.existsSync(path.join(localeDir, file))) {
        errors.push(`Missing required legal document: content/legal/${locale}/${file}`);
      }
    }
  }
  return errors;
}

// ─── slug 契約チェック ──────────────────────────────────────

// docs の公開 URL はフラット1階層（apps/web/src/lib/mdx.ts: slug = ファイル名、index.mdx はカテゴリ名）。
// ロケール内でファイル名が重複すると同一 URL を取り合うため、エラーとして止める
function checkDocsSlugCollisions() {
  const errors = [];
  for (const locale of ['en', 'ja']) {
    const dir = path.join(CONTENT_DIR, 'docs', locale);
    if (!fs.existsSync(dir)) continue;
    const bySlug = new Map();
    for (const file of findMdxFiles(dir)) {
      const rel = path.relative(dir, file).replace(/\\/g, '/');
      const name = path.basename(file, '.mdx');
      const slug = name === 'index' ? rel.split('/')[0] : name;
      const existing = bySlug.get(slug);
      if (existing) {
        errors.push(
          `Docs slug collision at /docs/${slug}: content/docs/${locale}/${existing} vs content/docs/${locale}/${rel}`,
        );
      } else {
        bySlug.set(slug, rel);
      }
    }
  }
  return errors;
}

// routing の slug と category はファイル配置から導出され、frontmatter の同名フィールドは
// mdx.ts に上書きされて無視される。記述値がずれても動作は壊れないが、内部リンクを書く時の
// 参照先として読まれるため嘘になる
function checkDocsSlugMatchesRouting() {
  const errors = [];
  for (const locale of ['en', 'ja']) {
    const dir = path.join(CONTENT_DIR, 'docs', locale);
    if (!fs.existsSync(dir)) continue;
    for (const file of findMdxFiles(dir)) {
      const rel = path.relative(dir, file).replace(/\\/g, '/');
      const name = path.basename(file, '.mdx');
      const routingSlug = name === 'index' ? rel.split('/')[0] : name;
      const routingCategory = rel.split('/')[0];
      const { data: fm } = parseFrontMatter(fs.readFileSync(file, 'utf8'));
      if (fm.slug && fm.slug !== routingSlug) {
        errors.push(
          `Slug mismatch in content/docs/${locale}/${rel}: frontmatter '${fm.slug}' but routing serves /docs/${routingSlug}`,
        );
      }
      if (fm.category && fm.category !== routingCategory) {
        errors.push(
          `Category mismatch in content/docs/${locale}/${rel}: frontmatter '${fm.category}' but directory says '${routingCategory}'`,
        );
      }
    }
  }
  return errors;
}

// 公開ページから 404 へのリンクを止める。リンク先が「そもそも無い」のは書き間違いなので error、
// 「ファイルはあるが draft」のは公開待ちの状態問題なので warning に分ける（draft を外せば直る。
// どこが公開待ちかは pnpm docs:coverage が一覧する）
function checkDocsInternalLinks() {
  const errors = [];
  const warnings = [];

  for (const locale of ['en', 'ja']) {
    const dir = path.join(CONTENT_DIR, 'docs', locale);
    if (!fs.existsSync(dir)) continue;

    const files = findMdxFiles(dir);
    const published = new Set();
    const unpublished = new Set();
    for (const file of files) {
      const rel = path.relative(dir, file).replace(/\\/g, '/');
      const name = path.basename(file, '.mdx');
      const slug = name === 'index' ? rel.split('/')[0] : name;
      const { data: fm } = parseFrontMatter(fs.readFileSync(file, 'utf8'));
      (fm.draft === true ? unpublished : published).add(slug);
    }

    for (const file of files) {
      const rel = path.relative(dir, file).replace(/\\/g, '/');
      const content = fs.readFileSync(file, 'utf8');
      const { data: fm } = parseFrontMatter(content);
      const isDraft = fm.draft === true;

      const targets = new Set();
      for (const [, href] of content.matchAll(/\]\((\/docs\/[a-z0-9/-]+)\)/g)) targets.add(href);
      for (const [, href] of content.matchAll(/^\s+- '(\/docs\/[a-z0-9/-]+)'$/gm))
        targets.add(href);

      for (const href of targets) {
        const slug = href.replace(/^\/docs\//, '');
        if (published.has(slug)) continue;

        const where = `content/docs/${locale}/${rel}`;
        if (unpublished.has(slug)) {
          // draft 同士のリンクは一緒に公開されるため 404 にならない。
          // 公開ページから未公開ページを指している場合だけが実害
          if (!isDraft) {
            warnings.push(
              `Link to unpublished doc in ${where}: ${href} (リンク先が draft のため 404)`,
            );
          }
        } else if (isDraft) {
          warnings.push(`Dead internal link in ${where}: ${href} (該当 slug のファイルなし)`);
        } else {
          errors.push(`Dead internal link in ${where}: ${href} (該当 slug のファイルなし)`);
        }
      }
    }
  }

  return { errors, warnings };
}

function checkBlogReservedSlugs() {
  const errors = [];
  for (const locale of ['en', 'ja']) {
    const dir = path.join(CONTENT_DIR, 'blog', locale);
    if (!fs.existsSync(dir)) continue;
    for (const file of findMdxFiles(dir)) {
      const slug = path.basename(file, '.mdx');
      if (RESERVED_BLOG_SLUGS.includes(slug)) {
        errors.push(
          `Reserved blog slug '${slug}' (content/blog/${locale}/${slug}.mdx): カテゴリ一覧 URL /blog/${slug} と衝突し記事が不可視になる`,
        );
      }
    }
  }
  return errors;
}

// ─── メイン ────────────────────────────────────────────────

function main() {
  const types = ['blog', 'docs', 'legal'];
  let totalFiles = 0;
  let totalErrors = 0;
  let totalWarnings = 0;
  const allOutput = [];

  const linkIssues = checkDocsInternalLinks();

  for (const error of [
    ...checkDocsSlugCollisions(),
    ...checkDocsSlugMatchesRouting(),
    ...checkBlogReservedSlugs(),
    ...linkIssues.errors,
  ]) {
    allOutput.push({ file: null, message: error, isError: true });
    totalErrors++;
  }

  for (const warning of linkIssues.warnings) {
    allOutput.push({ file: null, message: warning, isError: false });
    totalWarnings++;
  }

  for (const type of types) {
    const typeDir = path.join(CONTENT_DIR, type);
    const files = findMdxFiles(typeDir);

    const symmetryIssues = checkLanguageSymmetry(type);
    for (const issue of symmetryIssues) {
      allOutput.push({ file: null, message: issue, isError: type === 'legal' });
      if (type === 'legal') totalErrors++;
      else totalWarnings++;
    }

    if (type === 'legal') {
      for (const error of checkRequiredLegalDocuments()) {
        allOutput.push({ file: null, message: error, isError: true });
        totalErrors++;
      }
    }

    for (const file of files) {
      totalFiles++;
      const content = fs.readFileSync(file, 'utf8');
      const { data: fm, body } = parseFrontMatter(content);
      const isDraft = fm.draft === true;

      const { errors, warnings } = validateFrontMatter(fm, type, isDraft);
      if (type === 'legal') {
        errors.push(...validateLegalBody(body));
      }

      if (errors.length > 0 || warnings.length > 0) {
        const relPath = path.relative(process.cwd(), file).replace(/\\/g, '/');
        allOutput.push({ file: relPath, errors, warnings, isDraft });
      }

      totalErrors += errors.length;
      totalWarnings += warnings.length;
    }
  }

  console.log('');
  for (const item of allOutput) {
    if (item.file === null) {
      console.log(`  ${item.isError ? '❌' : '⚠️ '} ${item.message}`);
    } else {
      const icon = item.errors.length > 0 ? '❌' : '⚠️ ';
      const draftLabel = item.isDraft ? ' [draft]' : '';
      console.log(`  ${icon} ${item.file}${draftLabel}`);
      for (const e of item.errors) console.log(`       ❌ ${e}`);
      for (const w of item.warnings) console.log(`       ⚠️  ${w}`);
    }
  }

  console.log('');
  if (totalErrors === 0 && totalWarnings === 0) {
    console.log(`✅ All ${totalFiles} files passed validation`);
  } else {
    console.log(`Checked ${totalFiles} files`);
    if (totalErrors > 0) console.log(`  ❌ ${totalErrors} error(s)`);
    if (totalWarnings > 0) console.log(`  ⚠️  ${totalWarnings} warning(s)`);
  }
  console.log('');

  if (totalErrors > 0) {
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
