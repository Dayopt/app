#!/usr/bin/env node

/**
 * Check: Feature DAG（product feature 間の依存）
 *
 * apps/product の ESLint（no-restricted-imports）を実行し、`@/features/*` の
 * cross-feature / self（wrong path）import 違反数を集計する。ESLint ルール本体は
 * apps/product/eslint.config.mjs が持ち、`pnpm lint` が error として hard 強制する。
 * 本 checker はその違反数をラチェット budget と比較する二層目のゲート。
 */

import { execSync } from 'child_process';
import { resolve } from 'path';
import type { FeatureDagCounts } from '../budget.ts';
import { ROOT } from '../config.ts';

const APP_ROOT = resolve(ROOT, 'apps/product');

interface ESLintMessage {
  ruleId: string | null;
  message: string;
}

interface ESLintFileResult {
  filePath: string;
  messages: ESLintMessage[];
}

/** ESLint を 1 回だけ実行して JSON を得る（error 時 exit 1 でも stdout に JSON が出る）。 */
function runEslintJson(): ESLintFileResult[] {
  let jsonOutput = '';
  try {
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
    // eslint は error / --max-warnings 超過で exit 1。違反 JSON は stdout に出る。
    jsonOutput = (e as { stdout?: string }).stdout ?? '';
  }

  try {
    return JSON.parse(jsonOutput) as ESLintFileResult[];
  } catch {
    console.error('feature-dag: failed to parse ESLint JSON output');
    process.exit(1);
  }
}

export interface FeatureDagResult {
  counts: FeatureDagCounts;
  crossTotal: number;
  selfTotal: number;
}

export function runFeatureDag(): FeatureDagResult {
  const data = runEslintJson();
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
        selfImports[srcFeat] = (selfImports[srcFeat] ?? 0) + 1;
      } else {
        crossImports[srcFeat] = (crossImports[srcFeat] ?? 0) + 1;
      }
    }
  }

  const crossTotal = Object.values(crossImports).reduce((a, b) => a + b, 0);
  const selfTotal = Object.values(selfImports).reduce((a, b) => a + b, 0);
  return { counts: { crossImports, selfImports }, crossTotal, selfTotal };
}
