type Status = 'pass' | 'fail' | 'skipped';

interface StatusIndicatorProps {
  status: Status;
}

const statusConfig: Record<Status, { label: string; className: string }> = {
  pass: { label: 'Pass', className: 'bg-success' },
  fail: { label: 'Fail', className: 'bg-destructive' },
  skipped: { label: 'Skipped', className: 'bg-muted-foreground' },
};

export function StatusIndicator({ status }: StatusIndicatorProps) {
  const config = statusConfig[status];

  return (
    <div className="flex items-center gap-1">
      <div className={`size-2 rounded-full ${config.className}`} />
      <span className="text-muted-foreground text-xs">{config.label}</span>
    </div>
  );
}
