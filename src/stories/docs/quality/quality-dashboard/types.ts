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
  };
}
