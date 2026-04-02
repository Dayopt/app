/**
 * 品質ダッシュボード用 統一スナップショットスキーマ
 *
 * コレクタースクリプトとStoryboardダッシュボードの両方で使用する。
 */

export interface CoverageMetric {
  covered: number;
  total: number;
  pct: number;
}

export interface QualitySnapshot {
  version: 1;
  timestamp: string;
  gitSha: string;
  metrics: {
    typeSafety: {
      errors: number;
      status: 'pass' | 'fail';
    };
    testCoverage: {
      statements: CoverageMetric;
      functions: CoverageMetric;
      branches: CoverageMetric;
    };
    rlsCoverage: {
      tablesWithRls: number;
      totalTables: number;
      pct: number;
      policies: number;
    };
    storyCoverage: CoverageMetric;
    featureBoundaries: {
      violations: number;
    };
    circularDeps: {
      count: number;
    };
    deadCode: {
      unusedExports: number;
      unusedFiles: number;
    };
    a11y: {
      violations: number;
      status: 'pass' | 'fail' | 'skipped';
    };
    bundleSize: {
      loginPageGzipKB: number;
      smallestRouteGzipKB: number;
      largestRouteGzipKB: number;
      cssGzipKB: number;
      status: 'pass' | 'warn' | 'fail' | 'skipped';
    };
  };
}

export type MetricKey = keyof QualitySnapshot['metrics'];
