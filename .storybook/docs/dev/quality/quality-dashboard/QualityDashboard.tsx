import { CoverageBar } from './CoverageBar';
import { DeltaBadge } from './DeltaBadge';
import { MetricCard } from './MetricCard';
import { StatusIndicator } from './StatusIndicator';
import type { QualitySnapshot } from './types';

interface QualityDashboardProps {
  snapshot: QualitySnapshot;
  previousSnapshot: QualitySnapshot | null;
}

export function QualityDashboard({ snapshot, previousSnapshot }: QualityDashboardProps) {
  const { metrics } = snapshot;
  const prev = previousSnapshot?.metrics;

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      {/* ヘッダー */}
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-foreground text-2xl font-medium">Quality Dashboard</h1>
          <p className="text-muted-foreground mt-1 text-sm">品質メトリクスの定点観測</p>
        </div>
        <div className="text-muted-foreground text-right text-xs">
          <div>{formatDate(snapshot.timestamp)}</div>
          <div className="font-mono">{snapshot.gitSha}</div>
        </div>
      </div>

      {/* メトリクスグリッド */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* 型安全性 */}
        <MetricCard title="型安全性">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-medium tabular-nums">{metrics.typeSafety.errors}</span>
              <span className="text-muted-foreground text-sm">errors</span>
            </div>
            <div className="flex items-center gap-2">
              <DeltaBadge
                current={metrics.typeSafety.errors}
                previous={prev?.typeSafety.errors}
                invertColor
              />
              <StatusIndicator status={metrics.typeSafety.status} />
            </div>
          </div>
        </MetricCard>

        {/* テストカバレッジ */}
        <MetricCard title="テストカバレッジ">
          <CoverageBar label="Statements" pct={metrics.testCoverage.statements.pct} />
          <CoverageBar label="Functions" pct={metrics.testCoverage.functions.pct} />
          <CoverageBar label="Branches" pct={metrics.testCoverage.branches.pct} />
        </MetricCard>

        {/* RLSカバレッジ */}
        <MetricCard title="RLSカバレッジ">
          <CoverageBar pct={metrics.rlsCoverage.pct} />
          <div className="text-muted-foreground flex items-center justify-between text-xs">
            <span>
              {metrics.rlsCoverage.tablesWithRls}/{metrics.rlsCoverage.totalTables} tables
            </span>
            <div className="flex items-center gap-2">
              <span>{metrics.rlsCoverage.policies} policies</span>
              <DeltaBadge
                current={metrics.rlsCoverage.policies}
                previous={prev?.rlsCoverage.policies}
              />
            </div>
          </div>
        </MetricCard>

        {/* Storyカバレッジ */}
        <MetricCard title="Storyカバレッジ">
          <CoverageBar pct={metrics.storyCoverage.pct} />
          <div className="text-muted-foreground flex items-center justify-between text-xs">
            <span>
              {metrics.storyCoverage.covered}/{metrics.storyCoverage.total} components
            </span>
            <DeltaBadge
              current={metrics.storyCoverage.covered}
              previous={prev?.storyCoverage.covered}
            />
          </div>
        </MetricCard>

        {/* Feature境界 */}
        <MetricCard title="Feature境界違反">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-medium tabular-nums">
                {metrics.featureBoundaries.violations}
              </span>
              <span className="text-muted-foreground text-sm">violations</span>
            </div>
            <DeltaBadge
              current={metrics.featureBoundaries.violations}
              previous={prev?.featureBoundaries.violations}
              invertColor
            />
          </div>
        </MetricCard>

        {/* 循環依存 */}
        <MetricCard title="循環依存">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-medium tabular-nums">
                {metrics.circularDeps.count}
              </span>
              <span className="text-muted-foreground text-sm">cycles</span>
            </div>
            <DeltaBadge
              current={metrics.circularDeps.count}
              previous={prev?.circularDeps.count}
              invertColor
            />
          </div>
        </MetricCard>

        {/* Dead Code */}
        <MetricCard title="Dead Code">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">Unused exports</span>
              <div className="flex items-center gap-2">
                <span className="font-medium tabular-nums">{metrics.deadCode.unusedExports}</span>
                <DeltaBadge
                  current={metrics.deadCode.unusedExports}
                  previous={prev?.deadCode.unusedExports}
                  invertColor
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">Unused files</span>
              <div className="flex items-center gap-2">
                <span className="font-medium tabular-nums">{metrics.deadCode.unusedFiles}</span>
                <DeltaBadge
                  current={metrics.deadCode.unusedFiles}
                  previous={prev?.deadCode.unusedFiles}
                  invertColor
                />
              </div>
            </div>
          </div>
        </MetricCard>

        {/* アクセシビリティ */}
        <MetricCard title="アクセシビリティ">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-medium tabular-nums">{metrics.a11y.violations}</span>
              <span className="text-muted-foreground text-sm">violations</span>
            </div>
            <div className="flex items-center gap-2">
              <DeltaBadge
                current={metrics.a11y.violations}
                previous={prev?.a11y.violations}
                invertColor
              />
              <StatusIndicator status={metrics.a11y.status} />
            </div>
          </div>
        </MetricCard>
      </div>

      {/* フッター */}
      {previousSnapshot ? (
        <p className="text-muted-foreground text-xs">
          前回: {formatDate(previousSnapshot.timestamp)} ({previousSnapshot.gitSha})
        </p>
      ) : null}
    </div>
  );
}
