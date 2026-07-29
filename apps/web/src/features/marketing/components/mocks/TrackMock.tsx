import { MockWindow } from './MockWindow';

/**
 * TrackMock — 計画 vs 実績の比較ビュー
 * ダミーデータ。後で実プロダクト画面に差し替える。
 */
export function TrackMock() {
  const rows = [
    { label: 'Deep Work', planH: 4.5, actualH: 3.0 },
    { label: 'Meetings', planH: 2.0, actualH: 2.8 },
    { label: 'Email & Slack', planH: 1.0, actualH: 1.5 },
    { label: 'Code Review', planH: 2.5, actualH: 2.0 },
  ];

  const maxH = Math.max(...rows.map((r) => Math.max(r.planH, r.actualH)));

  return (
    <MockWindow>
      <div className="flex size-full flex-col p-4 select-none">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <span className="text-foreground text-sm font-medium">Plan vs Actual</span>
          <span className="bg-container text-muted-foreground rounded px-2 py-0.5 text-xs">
            This Week
          </span>
        </div>

        {/* Column labels */}
        <div className="text-muted-foreground mb-2 grid grid-cols-[1fr_auto_auto_auto] gap-x-3 text-xs">
          <span />
          <span className="w-12 text-right">Plan</span>
          <span className="w-12 text-right">Actual</span>
          <span className="w-12 text-right">Delta</span>
        </div>

        {/* Rows */}
        <div className="flex-1 space-y-3">
          {rows.map((row) => {
            const delta = row.actualH - row.planH;
            const isOver = delta > 0;
            return (
              <div key={row.label} className="space-y-1.5">
                <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 text-xs">
                  <span className="text-foreground font-medium">{row.label}</span>
                  <span className="text-muted-foreground w-12 text-right">{row.planH}h</span>
                  <span className="text-foreground w-12 text-right font-medium">
                    {row.actualH}h
                  </span>
                  <span
                    className={`w-12 text-right font-medium ${isOver ? 'text-destructive' : 'text-success'}`}
                  >
                    {isOver ? '+' : ''}
                    {delta.toFixed(1)}h
                  </span>
                </div>
                <div className="space-y-0.5">
                  <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
                    <div
                      className="bg-primary/25 h-full rounded-full"
                      style={{ width: `${(row.planH / maxH) * 100}%` }}
                    />
                  </div>
                  <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
                    <div
                      className="bg-primary h-full rounded-full"
                      style={{ width: `${(row.actualH / maxH) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-3 flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="bg-primary/25 size-2 rounded-full" />
            <span className="text-muted-foreground">Plan</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="bg-primary size-2 rounded-full" />
            <span className="text-muted-foreground">Actual</span>
          </div>
        </div>

        {/* 指標名は実在するものだけを出す（calendar.stats.overview.planAccuracy） */}
        <div className="border-border mt-3 border-t pt-3">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs">Plan accuracy</span>
            <div className="flex items-center gap-2">
              <span className="text-foreground font-mono text-lg font-medium tabular-nums">
                82%
              </span>
              <span className="bg-success-tint text-success rounded-full px-2 py-0.5 text-xs font-medium">
                Good
              </span>
            </div>
          </div>
          <div className="bg-muted mt-1.5 h-1.5 w-full overflow-hidden rounded-full">
            <div className="bg-primary h-full rounded-full" style={{ width: '82%' }} />
          </div>
        </div>
      </div>
    </MockWindow>
  );
}
