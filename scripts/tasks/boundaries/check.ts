#!/usr/bin/env node

/**
 * Import Boundary Checker（orchestrator）
 *
 * monorepo 全体の import 境界を 4 checker で検査する。
 *  - feature-dag        : product feature 間の DAG（ラチェット）
 *  - package-layers     : packages ↔ apps の依存方向（hard-fail）
 *  - public-api-barrels : 広域 app-local barrel の禁止（hard-fail）
 *  - import-paths       : 廃止 import path の検知（ラチェット）
 *
 * Usage:
 *   tsx scripts/tasks/boundaries/check.ts            # 検査（budget 不在なら fail）
 *   tsx scripts/tasks/boundaries/check.ts --update   # budget を現状値で再生成
 */

import { compareDeprecated, compareFeatureDag, readBudget, writeBudget } from './budget.ts';
import { runFeatureDag } from './checks/feature-dag.ts';
import { runImportPaths } from './checks/import-paths.ts';
import { runPackageLayers } from './checks/package-layers.ts';
import { runPublicApiBarrels } from './checks/public-api-barrels.ts';
import { BUDGET_FILE } from './config.ts';

const UPDATE_MODE = process.argv.includes('--update');

console.log('Import Boundary Check');
console.log('=====================');

const pkg = runPackageLayers();
const barrels = runPublicApiBarrels();
const featureDag = runFeatureDag();
const importPaths = runImportPaths();

console.log(`Feature DAG:             cross=${featureDag.crossTotal} self=${featureDag.selfTotal}`);
console.log(`Package layers:          ${pkg.violations.length} violation(s)`);
console.log(`Forbidden barrels:       ${barrels.violations.length} violation(s)`);
console.log(`Deprecated import paths: ${importPaths.deprecated}`);
console.log('');

// --update: 現状値で budget を再生成して終了（hard 違反の有無に関わらず lock in）。
if (UPDATE_MODE) {
  writeBudget(featureDag.counts, importPaths.deprecated);
  console.log(`Budget updated: ${BUDGET_FILE}`);
  process.exit(0);
}

const budget = readBudget();
if (budget === null) {
  console.error('No budget file found at .boundary-budget.json.');
  console.error('Run `pnpm lint:boundaries:update` to create one.');
  process.exit(1);
}

let failed = false;

function reportHard(title: string, violations: string[]): void {
  if (violations.length === 0) return;
  failed = true;
  console.log(`${title}:`);
  violations.forEach((v) => console.log(`  ${v}`));
  console.log('');
}

// hard checks（budget なし・現状 0 が前提の architectural invariant）
reportHard('PACKAGE LAYER VIOLATIONS', pkg.violations);
reportHard('FORBIDDEN BARREL VIOLATIONS', barrels.violations);

// ratchet checks
const fdDiff = compareFeatureDag(featureDag.counts, budget.featureDag);
const ipDiff = compareDeprecated(importPaths.deprecated, budget.importPaths.deprecated);

const improvements = [...fdDiff.improvements, ...ipDiff.improvements];
if (improvements.length > 0) {
  console.log('Improvements:');
  improvements.forEach((l) => console.log(l));
  console.log('');
  console.log('Run `pnpm lint:boundaries:update` to lock in improvements.');
  console.log('');
}

if (!fdDiff.ok || !ipDiff.ok) {
  failed = true;
  console.log('RATCHET REGRESSIONS:');
  [...fdDiff.regressions, ...ipDiff.regressions].forEach((l) => console.log(l));
  if (!ipDiff.ok) {
    console.log('');
    console.log('  New deprecated import paths:');
    importPaths.violations.forEach((v) => console.log(`    ${v}`));
  }
  console.log('');
}

if (failed) {
  console.log('Boundary violations detected. Fix the imports above.');
  process.exit(1);
}

console.log('All good. No boundary regressions detected.');
