/**
 * AppPreviewMockup — Hero 用のアプリ UI モックアップ
 *
 * 実際のスクリーンショットが用意できるまでの仮表示。
 * タイムボクシングアプリのカレンダービュー + タスクブロックを CSS で描画。
 *
 * TODO: 実際のスクリーンショットが用意できたら、
 * page.tsx で <Image src="/images/hero-screenshot.png" /> に差し替える。
 */
export function AppPreviewMockup() {
  const hours = ['9:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00'];

  const blocks = [
    {
      top: '0%',
      height: '22%',
      label: 'Deep Work: Design System',
      color: 'bg-primary/15 border-primary/30',
    },
    {
      top: '25%',
      height: '12%',
      label: 'Email & Slack',
      color: 'bg-tag-amber/15 border-tag-amber/30',
    },
    { top: '40%', height: '10%', label: 'Lunch', color: 'bg-container border-border' },
    {
      top: '53%',
      height: '22%',
      label: 'Code Review + PR',
      color: 'bg-tag-blue/15 border-tag-blue/30',
    },
    {
      top: '78%',
      height: '15%',
      label: 'Weekly Reflection',
      color: 'bg-tag-green/15 border-tag-green/30',
    },
  ];

  return (
    <div className="flex size-full select-none" aria-hidden="true">
      {/* Sidebar */}
      <div className="bg-container border-border hidden w-48 shrink-0 border-r p-3 lg:block">
        <div className="mb-4 flex items-center gap-2">
          <div className="bg-primary size-3 rounded-full" />
          <span className="text-foreground text-xs font-medium">Dayopt</span>
        </div>
        {/* ナビ項目は product の実際のサイドバー（navigation.sidebar.navigation）に合わせる */}
        <div className="space-y-1">
          {['Calendar', 'Plan', 'Record', 'Tags', 'Review'].map((item) => (
            <div
              key={item}
              className={`text-muted-foreground rounded px-2 py-1 text-xs ${item === 'Calendar' ? 'bg-state-active text-state-active-foreground font-medium' : ''}`}
            >
              {item}
            </div>
          ))}
        </div>
        {/* 指標名は実在するものだけを出す（calendar.stats.overview.planAccuracy） */}
        <div className="border-border mt-6 border-t pt-4">
          <div className="text-muted-foreground mb-2 text-xs">Plan accuracy</div>
          <div className="text-foreground text-2xl font-medium tabular-nums">87%</div>
          <div className="bg-container mt-2 h-1.5 w-full rounded-full">
            <div className="bg-primary h-1.5 rounded-full" style={{ width: '87%' }} />
          </div>
        </div>
      </div>

      {/* Main: Timeline */}
      <div className="flex flex-1 flex-col">
        {/* Header */}
        <div className="border-border flex items-center justify-between border-b px-4 py-2">
          <span className="text-foreground text-xs font-medium">Tuesday, Mar 17</span>
          <div className="flex gap-1">
            {['Day', 'Week'].map((view) => (
              <span
                key={view}
                className={`rounded px-2 py-0.5 text-xs ${view === 'Day' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
              >
                {view}
              </span>
            ))}
          </div>
        </div>

        {/* Timeline */}
        <div className="relative flex-1 overflow-hidden">
          {/* Time labels */}
          <div className="absolute inset-y-0 left-0 w-12">
            {hours.map((hour, i) => (
              <div
                key={hour}
                className="text-muted-foreground absolute right-2 text-xs tabular-nums"
                style={{ top: `${(i / hours.length) * 100}%` }}
              >
                {hour}
              </div>
            ))}
          </div>

          {/* Grid lines */}
          <div className="absolute inset-y-0 right-0 left-12">
            {hours.map((hour, i) => (
              <div
                key={hour}
                className="border-border absolute right-0 left-0 border-t"
                style={{ top: `${(i / hours.length) * 100}%` }}
              />
            ))}
          </div>

          {/* Time blocks */}
          <div className="absolute inset-y-0 right-3 left-14">
            {blocks.map((block) => (
              <div
                key={block.label}
                className={`absolute right-0 left-0 rounded-lg border px-3 py-1.5 ${block.color}`}
                style={{ top: block.top, height: block.height }}
              >
                <span className="text-foreground text-xs font-medium">{block.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
