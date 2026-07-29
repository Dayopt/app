import { MockWindow } from './MockWindow';

/**
 * LearnMock — 週次所見（予定と記録、パターン、見積もり傾向）
 * ダミーデータ。後で実プロダクト画面に差し替える。
 */
export function LearnMock() {
  const weeks = [
    { label: 'W1', value: 71 },
    { label: 'W2', value: 76 },
    { label: 'W3', value: 82 },
    { label: 'W4', value: 85 },
  ];

  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  // 5 rows (time slots) x 7 cols (days), 0-3 intensity
  const heatmap = [
    [0, 3, 3, 1, 0, 0, 0],
    [0, 2, 3, 0, 0, 0, 0],
    [1, 2, 2, 1, 1, 0, 0],
    [0, 1, 1, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0],
  ];

  const intensityClass = (v: number) => {
    if (v === 0) return 'bg-muted';
    if (v === 1) return 'bg-primary/20';
    if (v === 2) return 'bg-primary/50';
    return 'bg-primary';
  };

  return (
    <MockWindow>
      <div className="flex size-full flex-col p-4 select-none">
        {/* Header */}
        <div className="mb-3 flex items-center justify-between">
          <span className="text-foreground text-sm font-medium">Weekly Review</span>
          <span className="bg-container text-muted-foreground rounded px-2 py-0.5 text-xs">
            Mar 3 – 9
          </span>
        </div>

        <div className="flex flex-1 flex-col gap-2.5">
          {/* Plan and Record */}
          <div className="bg-container rounded-lg p-3">
            <div className="text-muted-foreground mb-2 text-xs font-medium">Plan and Record</div>
            <div className="flex items-baseline gap-3 text-xs">
              <div>
                <span className="text-muted-foreground">Plan </span>
                <span className="text-foreground font-mono font-medium tabular-nums">32h</span>
              </div>
              <div>
                <span className="text-muted-foreground">Record </span>
                <span className="text-foreground font-mono font-medium tabular-nums">28.5h</span>
              </div>
              <div>
                <span className="text-muted-foreground">Difference </span>
                <span className="text-destructive font-mono font-medium tabular-nums">-3.5h</span>
              </div>
            </div>
            {/* Budget vs Actual stacked bar */}
            <div className="mt-2 space-y-0.5">
              <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
                <div className="bg-primary/25 h-full rounded-full" style={{ width: '100%' }} />
              </div>
              <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
                <div className="bg-primary h-full rounded-full" style={{ width: '89%' }} />
              </div>
            </div>
          </div>

          {/* Patterns — Heatmap */}
          <div className="bg-container rounded-lg p-3">
            <div className="text-muted-foreground mb-1.5 text-xs font-medium">Weekly pattern</div>
            <p className="text-foreground mb-2 text-xs">Deep work accuracy peaks on Tue & Wed AM</p>
            {/* Day labels */}
            <div className="mb-1 grid grid-cols-7 gap-1">
              {days.map((d, i) => (
                <div key={i} className="text-muted-foreground text-center text-[10px]">
                  {d}
                </div>
              ))}
            </div>
            {/* Heatmap grid */}
            <div className="grid grid-cols-7 gap-1">
              {heatmap.flat().map((intensity, i) => (
                <div key={i} className={`aspect-square rounded-sm ${intensityClass(intensity)}`} />
              ))}
            </div>
          </div>

          {/* Estimate Trend */}
          <div className="bg-container rounded-lg p-3">
            <div className="text-muted-foreground mb-2 text-xs font-medium">Estimate trend</div>
            <div className="flex items-end gap-2">
              {weeks.map((week, i) => {
                const isLatest = i === weeks.length - 1;
                return (
                  <div key={week.label} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-muted-foreground font-mono text-[10px] tabular-nums">
                      {week.value}%
                    </span>
                    <div
                      className="bg-muted relative w-full overflow-hidden rounded"
                      style={{ height: 40 }}
                    >
                      <div
                        className={`absolute inset-x-0 bottom-0 rounded ${isLatest ? 'bg-primary' : 'bg-primary/30'}`}
                        style={{ height: `${week.value}%` }}
                      />
                    </div>
                    <span className="text-muted-foreground text-[10px]">{week.label}</span>
                  </div>
                );
              })}
            </div>
            {/* Insight */}
            <div className="mt-2 flex items-center gap-1 text-xs">
              <span className="text-success font-medium">
                ↑ <span className="font-mono tabular-nums">14%</span>
              </span>
              <span className="text-muted-foreground">closer than 4 weeks ago</span>
            </div>
          </div>
        </div>
      </div>
    </MockWindow>
  );
}
