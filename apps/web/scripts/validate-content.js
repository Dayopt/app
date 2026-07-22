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
  releases: ['version', 'date', 'title', 'description', 'tags', 'breaking', 'featured'],
};

const DATE_FIELDS = {
  blog: ['publishedAt', 'updatedAt'],
  docs: ['publishedAt', 'updatedAt'],
  legal: [],
  releases: ['date'],
};

export const REQUIRED_LEGAL_DOCUMENTS = [
  'cookies.mdx',
  'privacy.mdx',
  'security.mdx',
  'terms.mdx',
  'tokushoho.mdx',
];

// ─── フロントマターパーサー ─────────────────────────────────

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
      const value = line
        .replace(/^\s+-\s/, '')
        .trim()
        .replace(/^['"]|['"]$/g, '');
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
      const rawValue = keyValueMatch[2].trim();
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
      } else {
        data[currentKey] = rawValue.replace(/^['"]|['"]$/g, '');
      }
    }
  }

  return { data, body: content.slice(match[0].length) };
}

// ─── バリデーション ─────────────────────────────────────────

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

  if (type !== 'docs' && type !== 'legal') {
    const tags = fm.tags;
    if (Array.isArray(tags)) {
      if (tags.length > 0 && tags.length < 3) {
        report.push(`Too few tags (min: 3, found: ${tags.length})`);
      }
      if (tags.length > 6) {
        report.push(`Too many tags (max: 6, found: ${tags.length})`);
      }
    }
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

// ─── メイン ────────────────────────────────────────────────

function main() {
  const types = ['blog', 'docs', 'legal', 'releases'];
  let totalFiles = 0;
  let totalErrors = 0;
  let totalWarnings = 0;
  const allOutput = [];

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
