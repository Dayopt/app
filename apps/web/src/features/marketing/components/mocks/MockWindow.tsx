/**
 * MockWindow — macOS 風ウィンドウクローム wrapper
 * モックカードに「本物のアプリのスクショ」感を付与する。
 */
interface MockWindowProps {
  children: React.ReactNode;
}

export function MockWindow({ children }: MockWindowProps) {
  return (
    <div className="flex size-full flex-col" aria-hidden="true">
      {/* Title bar */}
      <div className="bg-container border-border flex shrink-0 items-center border-b px-3 py-2">
        {/* Traffic lights */}
        <div className="flex gap-1.5">
          <div className="size-2.5 rounded-full bg-[oklch(0.65_0.15_25)]" />
          <div className="size-2.5 rounded-full bg-[oklch(0.75_0.15_80)]" />
          <div className="size-2.5 rounded-full bg-[oklch(0.65_0.15_145)]" />
        </div>
        {/* App name */}
        <span className="text-muted-foreground flex-1 text-center text-xs font-medium">Dayopt</span>
        {/* Spacer to balance dots */}
        <div className="w-[42px]" />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
