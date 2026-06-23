'use client';

import { TagPill } from '@/components/ui/display/tag-pill';
import { Button } from '@dayopt/components';
import { X } from 'lucide-react';
import { useState } from 'react';

interface TagItem {
  tag: string;
  count: number;
}

interface InlineTagFilterProps {
  tags: TagItem[];
  selectedTags: string[];
  onToggle: (tag: string) => void;
  onClear: () => void;
  maxVisible?: number;
  showCounts?: boolean;
  label: string;
  showMoreLabel?: string;
  showLessLabel?: string;
}

export function InlineTagFilter({
  tags,
  selectedTags,
  onToggle,
  onClear,
  maxVisible = 10,
  showCounts = true,
  label,
  showMoreLabel = 'Show more',
  showLessLabel = 'Show less',
}: InlineTagFilterProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const visibleTags = isExpanded ? tags : tags.slice(0, maxVisible);
  const hasMore = tags.length > maxVisible;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <span id="tag-filter-label" className="text-muted-foreground text-sm font-medium">
          {label}
        </span>
        {selectedTags.length > 0 && (
          <Button onClick={onClear} variant="ghost" size="sm" className="h-auto p-1 text-xs">
            <X className="size-3" />
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-1" role="group" aria-labelledby="tag-filter-label">
        {visibleTags.map((tagItem) => (
          <TagPill
            key={tagItem.tag}
            tag={tagItem.tag}
            count={showCounts ? tagItem.count : undefined}
            selected={selectedTags.includes(tagItem.tag)}
            onClick={() => onToggle(tagItem.tag)}
          />
        ))}
      </div>

      {hasMore && (
        <Button
          onClick={() => setIsExpanded(!isExpanded)}
          variant="ghost"
          size="sm"
          className="mt-2 h-auto p-1 text-xs"
        >
          {isExpanded ? showLessLabel : `${showMoreLabel} (${tags.length - maxVisible})`}
        </Button>
      )}
    </div>
  );
}
