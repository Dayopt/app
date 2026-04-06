import type { ReactNode } from 'react';

interface MetricCardProps {
  title: string;
  children: ReactNode;
}

export function MetricCard({ title, children }: MetricCardProps) {
  return (
    <div className="border-border rounded-2xl border p-4">
      <h3 className="text-foreground mb-2 text-sm font-medium">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
