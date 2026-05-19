/**
 * LearnVisual — インサイトスニペット（Time P&L, パターン, 精度）
 */
export function LearnVisual() {
  return (
    <div className="flex size-full items-center justify-center p-4" aria-hidden="true">
      <div className="flex w-full max-w-[260px] flex-col gap-2">
        {/* Time P&L */}
        <div className="border-border rounded-lg border bg-[var(--background)]/30 p-3">
          <div className="mb-1.5 flex items-center gap-2">
            <div className="bg-primary/15 flex size-5 items-center justify-center rounded text-[10px]">
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                className="text-primary"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path d="M3 3v18h18" />
                <path d="M7 16l4-6 4 4 6-8" />
              </svg>
            </div>
            <span className="text-foreground text-[11px] font-medium">Time P&L</span>
          </div>
          <div className="flex gap-4">
            <div className="flex flex-col">
              <span className="text-primary text-base font-medium tabular-nums">22.5h</span>
              <span className="text-muted-foreground text-[9px] opacity-50">Planned</span>
            </div>
            <div className="flex flex-col">
              <span className="text-success text-base font-medium tabular-nums">18h</span>
              <span className="text-muted-foreground text-[9px] opacity-50">Actual</span>
            </div>
            <div className="flex flex-col">
              <span className="text-tag-amber text-base font-medium tabular-nums">−4.5h</span>
              <span className="text-muted-foreground text-[9px] opacity-50">Variance</span>
            </div>
          </div>
        </div>

        {/* Pattern */}
        <div className="border-border rounded-lg border bg-[var(--background)]/30 p-3">
          <div className="mb-1 flex items-center gap-2">
            <div className="bg-tag-amber/15 flex size-5 items-center justify-center rounded text-[10px]">
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                className="text-tag-amber"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
            </div>
            <span className="text-foreground text-[11px] font-medium">Pattern detected</span>
          </div>
          <p className="text-muted-foreground text-[10px] leading-relaxed">
            Deep work drops 40% on days with 2+ meetings.
          </p>
        </div>

        {/* Accuracy */}
        <div className="border-border rounded-lg border bg-[var(--background)]/30 p-3">
          <div className="mb-1 flex items-center gap-2">
            <div className="bg-success/15 flex size-5 items-center justify-center rounded text-[10px]">
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                className="text-success"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4l2 2" />
              </svg>
            </div>
            <span className="text-foreground text-[11px] font-medium">Accuracy: 61% → 74%</span>
          </div>
          <p className="text-muted-foreground text-[10px] leading-relaxed">
            Your plans are getting better every week.
          </p>
        </div>
      </div>
    </div>
  );
}
