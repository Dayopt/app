import { Minus } from 'lucide-react';

import { TagIcon } from '@/features/tags';

interface TimePLTagMarkerProps {
  isUncategorized: boolean;
  tagIcon: string | null | undefined;
  tagColor: string | null | undefined;
}

/** Neutral marker for the synthetic uncategorized bucket; normal tags keep their own color. */
export function TimePLTagMarker({ isUncategorized, tagIcon, tagColor }: TimePLTagMarkerProps) {
  if (isUncategorized) {
    return (
      <span
        data-slot="uncategorized-tag-marker"
        className="bg-muted text-muted-foreground inline-flex size-4 shrink-0 items-center justify-center rounded-full"
        aria-hidden="true"
      >
        <Minus className="size-3" />
      </span>
    );
  }

  return <TagIcon icon={tagIcon} color={tagColor} size="sm" />;
}
