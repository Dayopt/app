/**
 * TimeblockCard の下端リサイズハンドル
 *
 * PC: 常時 render、hover で pill 出現。
 * Mobile: Inspector 開いている entry（isActive）のみ render し、pill は常時表示。
 * PC の当たり判定は card 内に収め、直下のグリッド選択を塞がない。
 * card 本体の overflow-hidden 外に置くことで pill icon が短い card でも visible。
 */

interface TimeblockCardResizeHandleProps {
  frameTop: number;
  frameHeight: number;
  height: number;
  bottom: number;
  compact: boolean;
  ariaValueNow: number;
  ariaValueMin: number;
  label: string;
  onMouseDown: (e: React.MouseEvent) => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

export function TimeblockCardResizeHandle({
  frameTop,
  frameHeight,
  height,
  bottom,
  compact,
  ariaValueNow,
  ariaValueMin,
  label,
  onMouseDown,
  onTouchStart,
  onKeyDown,
}: TimeblockCardResizeHandleProps) {
  return (
    <div
      data-entry-resize-frame
      className="pointer-events-none absolute right-0 left-0"
      style={{
        top: `${frameTop}px`,
        height: `${frameHeight}px`,
      }}
    >
      {/* リサイズハンドルの見た目（横棒）は非表示に統一。
          pointer-events-none なので、実際のリサイズ操作は下の slider が担保し続ける。 */}
      <span
        aria-hidden
        className="bg-muted-foreground pointer-events-none absolute bottom-0 left-1/2 hidden h-1 w-8 -translate-x-1/2 rounded-full"
        style={{ zIndex: 11 }}
      />
      <div
        className="focus:ring-ring pointer-events-auto absolute cursor-ns-resize focus:ring-2 focus:ring-offset-1 focus:outline-none"
        role="slider"
        tabIndex={0}
        aria-label="Resize entry duration"
        aria-orientation="vertical"
        aria-valuenow={ariaValueNow}
        aria-valuemin={ariaValueMin}
        aria-valuemax={480}
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        onKeyDown={onKeyDown}
        style={{
          // Mobile は touch target 規約 (min-h-11) に合わせて常に 44px。
          // PC は card 内の下端だけを掴む。短い予定の直下に予定を作れるよう外へ張り出さない。
          height: `${height}px`,
          bottom: `${bottom}px`,
          left: compact ? '50%' : '0px',
          right: compact ? 'auto' : '0px',
          width: compact ? '32px' : 'auto',
          transform: compact ? 'translateX(-50%)' : 'none',
          zIndex: 10,
        }}
        title={label}
      />
    </div>
  );
}
