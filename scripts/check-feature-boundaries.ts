#!/usr/bin/env node

/**
 * Feature Boundary Checker (Ratchet)
 *
 * cross-feature importの違反数が予算を超えていないか検証する。
 * 違反数は減らすことはできるが、増やすことはできない（ラチェット方式）。
 *
 * Usage:
 *   npx tsx scripts/check-feature-boundaries.ts          # チェック実行
 *   npx tsx scripts/check-feature-boundaries.ts --update  # 予算ファイルを現状で更新
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const APP_ROOT = resolve(ROOT, 'apps/app');
const BUDGET_FILE = resolve(APP_ROOT, '.feature-boundary-budget.json');
const UPDATE_MODE = process.argv.includes('--update');

interface ESLintMessage {
  ruleId: string | null;
  message: string;
}

interface ESLintFileResult {
  filePath: string;
  messages: ESLintMessage[];
}

interface ViolationCounts {
  crossImports: Record<string, number>;
  selfImports: Record<string, number>;
}

interface BudgetFile {
  _comment: string;
  _updated: string;
  crossImports: Record<string, number>;
  selfImports: Record<string, number>;
}

// =============================================================================
// 1. ESLint実行 → 違反数を集計
// =============================================================================

function countViolations(): ViolationCounts {
  let jsonOutput: string;
  try {
    execSync('pnpm exec eslint src/features/ --format json --no-error-on-unmatched-pattern', {
      cwd: APP_ROOT,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    // eslint exits 0 if no errors (warnings don't cause non-zero)
    jsonOutput = execSync(
      'pnpm exec eslint src/features/ --format json --no-error-on-unmatched-pattern',
      {
        cwd: APP_ROOT,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
  } catch (e: unknown) {
    // eslint exits 1 when there are errors or --max-warnings exceeded
    const error = e as { stdout?: string };
    jsonOutput = error.stdout || '';
  }

  let data: ESLintFileResult[];
  try {
    data = JSON.parse(jsonOutput);
  } catch {
    console.error('Failed to parse ESLint JSON output');
    process.exit(1);
  }

  const crossImports: Record<string, number> = {};
  const selfImports: Record<string, number> = {};

  for (const file of data) {
    const srcMatch = file.filePath.match(/src\/features\/([^/]+)/);
    if (srcMatch === null) continue;
    const srcFeat = srcMatch[1];

    for (const msg of file.messages) {
      if (msg.ruleId !== 'no-restricted-imports') continue;
      const impMatch = msg.message.match(/'@\/features\/([^/]+)/);
      if (impMatch === null) continue;
      const depFeat = impMatch[1];

      if (depFeat === srcFeat) {
        selfImports[srcFeat] = (selfImports[srcFeat] || 0) + 1;
      } else {
        crossImports[srcFeat] = (crossImports[srcFeat] || 0) + 1;
      }
    }
  }

  return { crossImports, selfImports };
}

// =============================================================================
// 2. 予算ファイルの読み書き
// =============================================================================

function readBudget(): BudgetFile | null {
  try {
    return JSON.parse(readFileSync(BUDGET_FILE, 'utf8')) as BudgetFile;
  } catch {
    return null;
  }
}

function writeBudget(
  crossImports: Record<string, number>,
  selfImports: Record<string, number>,
): void {
  const budget: BudgetFile = {
    _comment: 'Feature boundary violation budget (ratchet). Do not increase these numbers.',
    _updated: new Date().toISOString().slice(0, 10),
    crossImports,
    selfImports,
  };
  writeFileSync(BUDGET_FILE, JSON.stringify(budget, null, 2) + '\n');
}

// =============================================================================
// 3. チェック実行
// =============================================================================

const { crossImports, selfImports } = countViolations();
const crossTotal = Object.values(crossImports).reduce((a, b) => a + b, 0);
const selfTotal = Object.values(selfImports).reduce((a, b) => a + b, 0);

console.log('Feature Boundary Check');
console.log('======================');
console.log(`Cross-feature imports: ${crossTotal}`);
console.log(`Self-imports (wrong path): ${selfTotal}`);
console.log(`Total: ${crossTotal + selfTotal}`);
console.log('');

if (UPDATE_MODE) {
  writeBudget(crossImports, selfImports);
  console.log(`Budget file updated: ${BUDGET_FILE}`);
  process.exit(0);
}

const budget = readBudget();
if (budget === null) {
  console.log('No budget file found. Run with --update to create one.');
  writeBudget(crossImports, selfImports);
  console.log(`Budget file created: ${BUDGET_FILE}`);
  process.exit(0);
}

// =============================================================================
// 4. 予算との比較
// =============================================================================

let hasRegression = false;
const regressions: string[] = [];
const improvements: string[] = [];

// Cross-imports check
for (const [feat, count] of Object.entries(crossImports)) {
  const budgetCount = budget.crossImports[feat] || 0;
  if (count > budgetCount) {
    hasRegression = true;
    regressions.push(
      `  FAIL: ${feat} cross-imports: ${budgetCount} -> ${count} (+${count - budgetCount})`,
    );
  } else if (count < budgetCount) {
    improvements.push(
      `  OK:   ${feat} cross-imports: ${budgetCount} -> ${count} (-${budgetCount - count})`,
    );
  }
}

// Check for new features not in budget
for (const [feat, count] of Object.entries(crossImports)) {
  if (budget.crossImports[feat] === undefined && count > 0) {
    hasRegression = true;
    regressions.push(`  FAIL: ${feat} (new) has ${count} cross-imports`);
  }
}

// Self-imports check
for (const [feat, count] of Object.entries(selfImports)) {
  const budgetCount = budget.selfImports[feat] || 0;
  if (count > budgetCount) {
    hasRegression = true;
    regressions.push(
      `  FAIL: ${feat} self-imports: ${budgetCount} -> ${count} (+${count - budgetCount})`,
    );
  } else if (count < budgetCount) {
    improvements.push(
      `  OK:   ${feat} self-imports: ${budgetCount} -> ${count} (-${budgetCount - count})`,
    );
  }
}

if (improvements.length > 0) {
  console.log('Improvements:');
  improvements.forEach((line) => console.log(line));
  console.log('');
  console.log(
    'Run `npx tsx scripts/check-feature-boundaries.ts --update` to lock in improvements.',
  );
  console.log('');
}

if (regressions.length > 0) {
  console.log('REGRESSIONS DETECTED:');
  regressions.forEach((line) => console.log(line));
  console.log('');
  console.log(
    'Feature boundary violations increased. Fix the new imports or use relative paths for same-feature imports.',
  );
  process.exit(1);
}

console.log('All good. No regressions detected.');
