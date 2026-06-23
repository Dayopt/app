#!/usr/bin/env node

/**
 * Boundary Checker - budget（ラチェット）の read/write & 比較
 *
 * `.boundary-budget.json`（root）に feature-dag と import-paths の違反数を記録し、
 * 「減らせるが増やせない」ラチェットを実現する。package-layers / public-api-barrels は
 * architectural invariant（現状 0）のため budget を持たず hard-fail。
 *
 * - 通常 check: budget ファイルが無ければ fail（exit 1）。committed budget 無しの素通りを防ぐ。
 * - --update: 現状値で budget を再生成する。
 */

import { readFileSync, writeFileSync } from 'fs';
import { BUDGET_FILE } from './config.ts';

export interface FeatureDagCounts {
  crossImports: Record<string, number>;
  selfImports: Record<string, number>;
}

export interface BudgetFile {
  _comment: string;
  _updated: string;
  featureDag: FeatureDagCounts;
  importPaths: { deprecated: number };
}

const COMMENT =
  'Import boundary violation budget (ratchet). Do not increase these numbers. Run `pnpm lint:boundaries:update` to lock in improvements.';

export function readBudget(): BudgetFile | null {
  try {
    const raw = JSON.parse(readFileSync(BUDGET_FILE, 'utf8')) as Partial<BudgetFile>;
    return {
      _comment: raw._comment ?? COMMENT,
      _updated: raw._updated ?? '',
      featureDag: {
        crossImports: raw.featureDag?.crossImports ?? {},
        selfImports: raw.featureDag?.selfImports ?? {},
      },
      importPaths: { deprecated: raw.importPaths?.deprecated ?? 0 },
    };
  } catch {
    return null;
  }
}

export function writeBudget(featureDag: FeatureDagCounts, deprecated: number): void {
  const budget: BudgetFile = {
    _comment: COMMENT,
    _updated: new Date().toISOString().slice(0, 10),
    featureDag,
    importPaths: { deprecated },
  };
  writeFileSync(BUDGET_FILE, JSON.stringify(budget, null, 2) + '\n');
}

// =============================================================================
// ラチェット比較
// =============================================================================

export interface RatchetDiff {
  ok: boolean;
  regressions: string[];
  improvements: string[];
}

/** feature DAG の cross/self を per-feature でラチェット比較。新規 feature の違反も regression。 */
export function compareFeatureDag(
  current: FeatureDagCounts,
  budget: FeatureDagCounts,
): RatchetDiff {
  const regressions: string[] = [];
  const improvements: string[] = [];

  const compare = (
    label: string,
    cur: Record<string, number>,
    bud: Record<string, number>,
  ): void => {
    for (const [feat, count] of Object.entries(cur)) {
      const budgetCount = bud[feat] ?? 0;
      if (count > budgetCount) {
        const tag = bud[feat] === undefined ? '(new)' : `${budgetCount} ->`;
        regressions.push(`  FAIL: ${feat} ${label}: ${tag} ${count} (+${count - budgetCount})`);
      } else if (count < budgetCount) {
        improvements.push(
          `  OK:   ${feat} ${label}: ${budgetCount} -> ${count} (-${budgetCount - count})`,
        );
      }
    }
  };

  compare('cross-imports', current.crossImports, budget.crossImports);
  compare('self-imports', current.selfImports, budget.selfImports);

  return { ok: regressions.length === 0, regressions, improvements };
}

/** deprecated import path 総数のラチェット比較。 */
export function compareDeprecated(current: number, budget: number): RatchetDiff {
  if (current > budget) {
    return {
      ok: false,
      regressions: [
        `  FAIL: deprecated import paths: ${budget} -> ${current} (+${current - budget})`,
      ],
      improvements: [],
    };
  }
  if (current < budget) {
    return {
      ok: true,
      regressions: [],
      improvements: [
        `  OK:   deprecated import paths: ${budget} -> ${current} (-${budget - current})`,
      ],
    };
  }
  return { ok: true, regressions: [], improvements: [] };
}
