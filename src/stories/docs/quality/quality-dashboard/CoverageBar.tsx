interface CoverageBarProps {
  pct: number;
  label?: string;
}

export function CoverageBar({ pct, label }: CoverageBarProps) {
  const clampedPct = Math.min(100, Math.max(0, pct));

  return (
    <div className="flex items-center gap-2">
      {label ? <span className="text-muted-foreground w-24 shrink-0 text-xs">{label}</span> : null}
      <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
        <div
          className={`h-full rounded-full transition-all ${
            clampedPct >= 80 ? 'bg-success' : clampedPct >= 60 ? 'bg-warning' : 'bg-destructive'
          }`}
          style={{ width: `${clampedPct}%` }}
        />
      </div>
      <span className="w-12 text-right text-xs tabular-nums">{pct}%</span>
    </div>
  );
}
