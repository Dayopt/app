interface DeltaBadgeProps {
  current: number;
  previous: number | undefined;
  /** trueの場合、値が増えると悪化（赤）、減ると改善（緑） */
  invertColor?: boolean;
}

export function DeltaBadge({ current, previous, invertColor = false }: DeltaBadgeProps) {
  if (previous === undefined) return null;

  const delta = current - previous;
  if (delta === 0) {
    return (
      <span className="bg-muted text-muted-foreground rounded-lg px-1.5 py-0.5 text-xs">±0</span>
    );
  }

  const isPositive = delta > 0;
  const isGood = invertColor ? !isPositive : isPositive;

  return (
    <span
      className={`rounded-lg px-1.5 py-0.5 text-xs font-medium ${
        isGood ? 'bg-success-tint text-success' : 'bg-destructive-tint text-destructive'
      }`}
    >
      {isPositive ? '+' : ''}
      {delta}
    </span>
  );
}
