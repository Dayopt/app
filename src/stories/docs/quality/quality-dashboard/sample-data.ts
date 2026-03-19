import type { QualitySnapshot } from './types';

/**
 * Storybook表示用のサンプルデータ。
 * quality-reports/latest.json が存在しない場合のフォールバックとして使用。
 */
export const sampleSnapshot: QualitySnapshot = {
  version: 1,
  timestamp: '2026-03-19T09:00:00.000Z',
  gitSha: '957756c',
  metrics: {
    typeSafety: { errors: 0, status: 'pass' },
    testCoverage: {
      statements: { covered: 1200, total: 1800, pct: 66.67 },
      functions: { covered: 350, total: 500, pct: 70.0 },
      branches: { covered: 280, total: 450, pct: 62.22 },
    },
    rlsCoverage: { tablesWithRls: 17, totalTables: 19, pct: 89.47, policies: 73 },
    storyCoverage: { covered: 40, total: 55, pct: 72.73 },
    featureBoundaries: { violations: 0 },
    circularDeps: { count: 2 },
    deadCode: { unusedExports: 15, unusedFiles: 3 },
    a11y: { violations: 0, status: 'pass' },
  },
};

export const samplePreviousSnapshot: QualitySnapshot = {
  version: 1,
  timestamp: '2026-03-12T09:00:00.000Z',
  gitSha: 'abc1234',
  metrics: {
    typeSafety: { errors: 2, status: 'fail' },
    testCoverage: {
      statements: { covered: 1150, total: 1750, pct: 65.71 },
      functions: { covered: 340, total: 490, pct: 69.39 },
      branches: { covered: 270, total: 440, pct: 61.36 },
    },
    rlsCoverage: { tablesWithRls: 15, totalTables: 19, pct: 78.95, policies: 65 },
    storyCoverage: { covered: 38, total: 53, pct: 71.7 },
    featureBoundaries: { violations: 3 },
    circularDeps: { count: 4 },
    deadCode: { unusedExports: 22, unusedFiles: 5 },
    a11y: { violations: 1, status: 'fail' },
  },
};
