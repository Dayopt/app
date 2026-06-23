import { cn } from '@/lib/utils';
import { Hash, X } from 'lucide-react';

interface TagPillProps {
  tag: string;
  count?: number;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}

export function TagPill({ tag, count, selected, onClick, className }: TagPillProps) {
  const Component = onClick ? 'button' : 'span';

  return (
    <Component
      onClick={onClick}
      className={cn(
        'border-border inline-flex items-center gap-1 rounded-lg border bg-transparent px-2 py-1 text-xs font-medium transition-colors',
        selected
          ? 'bg-primary text-primary-foreground border-primary hover:bg-primary-hover'
          : 'text-muted-foreground hover:bg-state-hover',
        onClick && 'cursor-pointer',
        className,
      )}
    >
      <Hash className="size-3" />
      {tag}
      {count !== undefined && (
        <span className={cn('text-xs', selected ? 'text-primary-foreground' : 'opacity-60')}>
          ({count})
        </span>
      )}
      {selected && <X className="size-3" />}
    </Component>
  );
}
