#!/usr/bin/env node
/**
 * Storybook Story カバレッジチェッカー
 *
 * チェック項目:
 * 1. UI / Common コンポーネントの Story 存在確認
 * 2. AllPatterns Story の存在確認
 * 3. StoryObj<typeof meta> の型安全確認
 *
 * Usage:
 *   npx tsx scripts/check-story-coverage.ts           # レポート表示
 *   npx tsx scripts/check-story-coverage.ts --strict   # カバレッジ低下で exit 1
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const APP_ROOT = path.join(ROOT, 'apps/app');
const STORYBOOK_ROOT = path.join(ROOT, 'apps/storybook');

// ─────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────

const SCAN_DIRS = [
  { dir: path.join(APP_ROOT, 'src/lib/components/ui'), label: 'UI Components' },
  { dir: path.join(APP_ROOT, 'src/lib/components/common'), label: 'Common Components' },
];

const isStrict = process.argv.includes('--strict');

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

interface CoverageResult {
  component: string;
  dir: string;
  label: string;
  hasStory: boolean;
}

interface QualityResult {
  file: string;
  hasAllPatterns: boolean;
  hasTypedStoryObj: boolean;
}

// ─────────────────────────────────────────────────────────
// Coverage Check
// ─────────────────────────────────────────────────────────

function getComponentFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(
      (f) =>
        f.endsWith('.tsx') &&
        !f.endsWith('.stories.tsx') &&
        !f.endsWith('.test.tsx') &&
        f !== 'index.tsx' &&
        f !== 'index.ts' &&
        !f.startsWith('use-'),
    );
}

function checkCoverage(): CoverageResult[] {
  const results: CoverageResult[] = [];

  for (const { dir, label } of SCAN_DIRS) {
    const files = getComponentFiles(dir);
    for (const file of files) {
      const base = file.replace(/\.tsx$/, '');
      const storyFile = path.join(dir, `${base}.stories.tsx`);
      results.push({
        component: file,
        dir,
        label,
        hasStory: fs.existsSync(storyFile),
      });
    }
  }

  return results;
}

// ─────────────────────────────────────────────────────────
// Quality Check
// ─────────────────────────────────────────────────────────

function findAllStoryFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.next') {
      results.push(...findAllStoryFiles(fullPath));
    } else if (entry.name.endsWith('.stories.tsx')) {
      results.push(fullPath);
    }
  }
  return results;
}

/** AllPatterns / 型チェック対象外のパス（Foundations, Patterns, Docs, Emails） */
const QUALITY_EXCLUDE_PATTERNS = [
  '/styles/tokens/',
  '/stories/patterns/',
  '/stories/docs/',
  '/emails/',
];

function isQualityExcluded(filePath: string): boolean {
  return QUALITY_EXCLUDE_PATTERNS.some((p) => filePath.includes(p));
}

function checkQuality(storyFiles: string[]): QualityResult[] {
  return storyFiles.map((file) => {
    const relPath = path.relative(ROOT, file);
    const content = fs.readFileSync(file, 'utf-8');
    const excluded = isQualityExcluded(relPath);

    // AllPatterns の存在確認（除外パスはスキップ）
    const hasAllPatterns = excluded || /export\s+const\s+AllPatterns/.test(content);

    // StoryObj<typeof meta> の型安全確認（除外パスはスキップ）
    // OK: type Story = StoryObj<typeof meta>
    // NG: type Story = StoryObj (ジェネリクスなし)
    let hasTypedStoryObj = true;
    if (!excluded) {
      const storyObjMatch = content.match(/type\s+Story\s*=\s*StoryObj(<[^>]+>)?/);
      hasTypedStoryObj = storyObjMatch ? storyObjMatch[1] !== undefined : true;
    }

    return {
      file: relPath,
      hasAllPatterns,
      hasTypedStoryObj,
    };
  });
}

// ─────────────────────────────────────────────────────────
// Report
// ─────────────────────────────────────────────────────────

function main(): void {
  // Coverage
  const coverageResults = checkCoverage();
  const covered = coverageResults.filter((r) => r.hasStory);
  const missing = coverageResults.filter((r) => !r.hasStory);

  console.log('\n━━━ Story Coverage ━━━\n');
  console.log(`Total: ${covered.length}/${coverageResults.length} components\n`);

  if (missing.length > 0) {
    console.log(`Missing stories (${missing.length}):`);
    for (const { component, label } of missing) {
      console.log(`  [${label}] ${component}`);
    }
  } else {
    console.log('All components have stories.');
  }

  // Quality
  const storyFiles = [
    ...findAllStoryFiles(path.join(APP_ROOT, 'src')),
    ...findAllStoryFiles(path.join(STORYBOOK_ROOT, '.storybook')),
  ];
  const qualityResults = checkQuality(storyFiles);

  const missingAllPatterns = qualityResults.filter((r) => !r.hasAllPatterns);
  const untypedStoryObj = qualityResults.filter((r) => !r.hasTypedStoryObj);

  console.log('\n━━━ Story Quality ━━━\n');
  console.log(`Total story files: ${qualityResults.length}\n`);

  if (missingAllPatterns.length > 0) {
    console.log(`Missing AllPatterns (${missingAllPatterns.length}):`);
    for (const { file } of missingAllPatterns) {
      console.log(`  ${file}`);
    }
  } else {
    console.log('All stories have AllPatterns.');
  }

  if (untypedStoryObj.length > 0) {
    console.log(`\nUntyped StoryObj (${untypedStoryObj.length}):`);
    for (const { file } of untypedStoryObj) {
      console.log(`  ${file}`);
    }
  } else {
    console.log('All StoryObj are properly typed.');
  }

  console.log('');

  // Strict mode
  if (isStrict && missing.length > 0) {
    console.error(`ERROR: ${missing.length} components missing stories (strict mode)`);
    process.exit(1);
  }
}

main();
