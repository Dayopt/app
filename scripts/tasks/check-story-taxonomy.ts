#!/usr/bin/env node
/**
 * Storybook Story Taxonomy チェッカー（ADR-023）
 *
 * story の meta title prefix が物理位置（所有境界 Shared / Product / Web）と
 * 一致するかを検証する。一致しない story が 1 件でもあれば exit 1（hard-fail）。
 *
 * 設計上の肝:
 *   meta title は CSF の `const meta` / `export default` の title のみを抽出する。
 *   prop / fixture の `title:`（例: defaultLabels.title, CalendarEvent.title）を
 *   誤検知しないよう、meta 宣言をアンカーにして直後の最初の title を取る。
 *
 * 参照: docs/log/decisions/023-storybook-ownership-taxonomy.md
 *
 * Usage:
 *   npx tsx scripts/tasks/check-story-taxonomy.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');

// ─────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────

/** story / mdx を走査する root ディレクトリ */
const SCAN_DIRS = [
  path.join(ROOT, 'packages/components/src'),
  path.join(ROOT, 'packages/foundations/src'),
  path.join(ROOT, 'apps/product/src'),
  path.join(ROOT, 'apps/storybook/.storybook/stories'),
  path.join(ROOT, 'apps/web/src'),
];

/**
 * 物理位置 → 許容 title prefix（ADR-023 の移行ルール表に準拠）。
 *
 * 評価は配列の上から順。最初にマッチした rule を採用するため、
 * より具体的な path（emails）を product/src より前に置く。
 * どの rule にもマッチしない story は taxonomy 対象外として skip する
 * （例: .storybook/stories/docs の Welcome / Glossary など top-level doc）。
 */
const TAXONOMY_RULES: { match: string; allowed: string[] }[] = [
  { match: 'apps/product/src/emails', allowed: ['Product/Emails'] },
  // product の component / feature / app-shell。straggler 例外で Components も許容
  { match: 'apps/product/src', allowed: ['Product/Components', 'Product/Features'] },
  { match: 'packages/components/src', allowed: ['Shared/Components'] },
  { match: 'packages/foundations/src', allowed: ['Shared/Foundations'] },
  // patterns は依存ベースで Shared / Product に分かれる（両方許容）
  {
    match: 'apps/storybook/.storybook/stories/patterns',
    allowed: ['Shared/Patterns', 'Product/Patterns'],
  },
  { match: 'apps/web/src', allowed: ['Web'] },
];

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

interface Violation {
  file: string;
  actual: string;
  expected: string[];
}

// ─────────────────────────────────────────────────────────
// Collection
// ─────────────────────────────────────────────────────────

function findStoryFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.next') {
      results.push(...findStoryFiles(fullPath));
    } else if (entry.name.endsWith('.stories.tsx') || entry.name.endsWith('.mdx')) {
      results.push(fullPath);
    }
  }
  return results;
}

// ─────────────────────────────────────────────────────────
// Title 抽出
// ─────────────────────────────────────────────────────────

/**
 * meta title のみを抽出する。
 * - .mdx: `<Meta title="...">` を取る（title を持たない doc は null）
 * - .stories.tsx: `const meta` / `export default` をアンカーにし、その直後の
 *   最初の `title:` を取る。これにより宣言前の fixture / 宣言後の prop を除外する。
 */
function extractMetaTitle(file: string, content: string): string | null {
  if (file.endsWith('.mdx')) {
    const m = content.match(/<Meta\b[^>]*\btitle\s*=\s*["']([^"']+)["']/);
    return m ? m[1] : null;
  }

  const anchor = content.search(/(?:const\s+meta\b|export\s+default\b)/);
  if (anchor === -1) return null;
  const m = content.slice(anchor).match(/title\s*:\s*["']([^"']+)["']/);
  return m ? m[1] : null;
}

function matchRule(relPath: string): { allowed: string[] } | null {
  const normalized = relPath.replace(/\\/g, '/');
  for (const rule of TAXONOMY_RULES) {
    if (normalized.includes(rule.match)) return rule;
  }
  return null;
}

function isAllowed(title: string, allowed: string[]): boolean {
  return allowed.some((prefix) => title === prefix || title.startsWith(`${prefix}/`));
}

// ─────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────

function main(): void {
  const files = SCAN_DIRS.flatMap((dir) => findStoryFiles(dir));

  const violations: Violation[] = [];
  const noTitle: string[] = [];
  let checked = 0;

  for (const file of files) {
    const relPath = path.relative(ROOT, file).replace(/\\/g, '/');
    const rule = matchRule(relPath);
    if (!rule) continue; // taxonomy 対象外（top-level doc 等）

    const content = fs.readFileSync(file, 'utf-8');
    const title = extractMetaTitle(file, content);

    // title を持たない mdx（純 doc）は対象外。stories は meta title 必須なので warn
    if (title === null) {
      if (file.endsWith('.stories.tsx')) noTitle.push(relPath);
      continue;
    }

    checked++;
    if (!isAllowed(title, rule.allowed)) {
      violations.push({ file: relPath, actual: title, expected: rule.allowed });
    }
  }

  console.log('\n━━━ Story Taxonomy (ADR-023) ━━━\n');
  console.log(`Checked: ${checked} stories across ${SCAN_DIRS.length} roots\n`);

  if (noTitle.length > 0) {
    console.log(`⚠ meta title が抽出できない story (${noTitle.length}):`);
    for (const f of noTitle) console.log(`  ${f}`);
    console.log('');
  }

  if (violations.length === 0) {
    console.log('✓ All story titles match their ownership boundary.\n');
    return;
  }

  console.log(`✗ Taxonomy violations (${violations.length}):\n`);
  for (const { file, actual, expected } of violations) {
    console.log(`  ${file}`);
    console.log(`    actual:   ${actual}`);
    console.log(`    expected: ${expected.map((e) => `${e}/...`).join(' or ')}`);
  }
  console.log('');
  console.error(
    `ERROR: ${violations.length} story title(s) violate the ownership taxonomy (ADR-023).`,
  );
  process.exit(1);
}

main();
