#!/usr/bin/env node

/**
 * 差分カバレッジ計算スクリプト
 *
 * 変更されたファイルのカバレッジを計算し、
 * 重要領域（auth, server, lib/supabase）は厳格にチェックする
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

// 重要領域の定義（これらは厳格にチェック）
const CRITICAL_PATHS: string[] = ['src/features/auth/', 'src/server/', 'src/platform/supabase/'];

// 重要領域のカバレッジ閾値
const CRITICAL_THRESHOLD = 80;

// 通常領域のカバレッジ閾値（警告のみ）
const NORMAL_THRESHOLD = 70;

interface FileCoverage {
  covered: number;
  total: number;
  percentage: number;
}

interface CoverageFileData {
  s: Record<string, number>;
}

interface CoverageResult {
  file: string;
  coverage: number;
  threshold: number;
  passed: boolean;
  isCritical: boolean;
}

interface UncoveredResult {
  file: string;
  isCritical: boolean;
}

interface Results {
  critical: CoverageResult[];
  normal: CoverageResult[];
  uncovered: UncoveredResult[];
}

function getChangedFiles(baseBranch = 'origin/main'): string[] {
  try {
    const output = execSync(`git diff --name-only ${baseBranch}...HEAD`, {
      encoding: 'utf-8',
    });
    return output
      .split('\n')
      .filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'))
      .filter((f) => !f.includes('.test.') && !f.includes('.spec.'))
      .filter((f) => f.startsWith('src/'));
  } catch {
    console.log('⚠️ Could not get changed files from git');
    return [];
  }
}

function isCriticalPath(filePath: string): boolean {
  return CRITICAL_PATHS.some((critical) => filePath.startsWith(critical));
}

function loadCoverageData(): Record<string, CoverageFileData> {
  const coveragePath = resolve(process.cwd(), 'coverage/coverage-final.json');

  if (!existsSync(coveragePath)) {
    console.error('❌ coverage/coverage-final.json not found');
    console.log('   Run: npm run test:coverage');
    process.exit(1);
  }

  return JSON.parse(readFileSync(coveragePath, 'utf-8')) as Record<string, CoverageFileData>;
}

function calculateFileCoverage(fileData: CoverageFileData | undefined): FileCoverage | null {
  if (!fileData || !fileData.s) {
    return null;
  }

  const statements = Object.values(fileData.s);
  if (statements.length === 0) return null;

  const covered = statements.filter((count) => count > 0).length;
  const total = statements.length;

  return {
    covered,
    total,
    percentage: total > 0 ? (covered / total) * 100 : 0,
  };
}

function main(): void {
  console.log('📊 Diff Coverage Analysis\n');

  const changedFiles = getChangedFiles();

  if (changedFiles.length === 0) {
    console.log('✅ No source files changed');
    process.exit(0);
  }

  console.log(`📁 Changed files: ${changedFiles.length}\n`);

  const coverageData = loadCoverageData();

  const results: Results = {
    critical: [],
    normal: [],
    uncovered: [],
  };

  for (const file of changedFiles) {
    const absolutePath = resolve(process.cwd(), file);

    // coverage-final.json のキーは絶対パス
    const fileData = coverageData[absolutePath];
    const coverage = calculateFileCoverage(fileData);
    const isCritical = isCriticalPath(file);

    if (!coverage) {
      results.uncovered.push({ file, isCritical });
      continue;
    }

    const threshold = isCritical ? CRITICAL_THRESHOLD : NORMAL_THRESHOLD;
    const passed = coverage.percentage >= threshold;

    const result: CoverageResult = {
      file,
      coverage: coverage.percentage,
      threshold,
      passed,
      isCritical,
    };

    if (isCritical) {
      results.critical.push(result);
    } else {
      results.normal.push(result);
    }
  }

  // 結果表示
  console.log('### Critical Files (auth, server, supabase)\n');
  if (results.critical.length === 0) {
    console.log('  No critical files changed\n');
  } else {
    for (const r of results.critical) {
      const emoji = r.passed ? '✅' : '❌';
      console.log(`  ${emoji} ${r.file}: ${r.coverage.toFixed(1)}% (threshold: ${r.threshold}%)`);
    }
    console.log('');
  }

  console.log('### Other Files\n');
  if (results.normal.length === 0) {
    console.log('  No other source files changed\n');
  } else {
    for (const r of results.normal) {
      const emoji = r.passed ? '✅' : '⚠️';
      console.log(`  ${emoji} ${r.file}: ${r.coverage.toFixed(1)}% (threshold: ${r.threshold}%)`);
    }
    console.log('');
  }

  if (results.uncovered.length > 0) {
    console.log('### Uncovered Files (no test coverage data)\n');
    for (const r of results.uncovered) {
      const emoji = r.isCritical ? '❌' : '⚠️';
      console.log(`  ${emoji} ${r.file}`);
    }
    console.log('');
  }

  // 集計
  const criticalFailed = results.critical.filter((r) => !r.passed);
  const criticalUncovered = results.uncovered.filter((r) => r.isCritical);
  const normalFailed = results.normal.filter((r) => !r.passed);

  console.log('---\n');

  // 重要領域の失敗があれば exit 1
  if (criticalFailed.length > 0 || criticalUncovered.length > 0) {
    console.log(
      `❌ ${criticalFailed.length + criticalUncovered.length} critical file(s) below threshold`,
    );
    console.log('   Critical files require 80%+ coverage\n');

    // JSON出力（CI用）
    console.log(
      '::set-output name=critical_failed::' + (criticalFailed.length + criticalUncovered.length),
    );
    console.log('::set-output name=normal_failed::' + normalFailed.length);

    process.exit(1);
  }

  if (normalFailed.length > 0) {
    console.log(`⚠️ ${normalFailed.length} file(s) below threshold (warning only)`);
    console.log('::set-output name=critical_failed::0');
    console.log('::set-output name=normal_failed::' + normalFailed.length);
    process.exit(0); // 警告のみ、失敗にしない
  }

  console.log('✅ All changed files meet coverage thresholds\n');
  console.log('::set-output name=critical_failed::0');
  console.log('::set-output name=normal_failed::0');
  process.exit(0);
}

main();
