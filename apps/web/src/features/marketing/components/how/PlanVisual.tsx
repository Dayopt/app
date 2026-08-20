/**
 * PlanVisual — ミニタイムライン（ドラッグ&ドロップのイメージ）
 */
export function PlanVisual() {
  const blocks = [
    {
      label: 'Deep Work',
      time: '2h',
      height: 44,
      color: 'bg-primary/15 border-l-2 border-l-primary text-primary',
    },
    {
      label: 'Standup',
      time: '30m',
      height: 24,
      color: 'bg-category-amber-tint border-l-2 border-l-category-amber',
    },
    {
      label: 'Deep Work',
      time: '1h',
      height: 32,
      color: 'bg-primary/15 border-l-2 border-l-primary text-primary',
    },
    {
      label: 'Lunch',
      time: '1h',
      height: 32,
      color: 'bg-category-green-tint border-l-2 border-l-category-green',
    },
    {
      label: 'Reading',
      time: '1h',
      height: 32,
      color: 'bg-category-violet-tint border-l-2 border-l-category-violet',
    },
  ];

  return (
    <div className="relative size-full" aria-hidden="true">
      {/* Drag indicator */}
      <div className="bg-primary/15 border-primary/25 absolute top-4 right-4 flex size-7 items-center justify-center rounded-lg border">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          className="text-primary opacity-60"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M12 2v20M2 12h20M7 7l5-5 5 5M7 17l5 5 5-5" />
        </svg>
      </div>

      <div className="flex size-full items-center justify-center p-6">
        <div className="flex w-full max-w-[260px] flex-col gap-1">
          {blocks.map((block, i) => (
            <div
              key={i}
              className={`flex items-center justify-between rounded-[6px] px-2.5 text-xs font-medium ${block.color}`}
              style={{ height: block.height }}
            >
              <span className="text-foreground">{block.label}</span>
              <span className="text-muted-foreground text-[10px] font-normal">{block.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
