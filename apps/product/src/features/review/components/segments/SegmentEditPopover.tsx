'use client';

import { useCallback, useMemo, useState } from 'react';

import { useTranslations } from 'next-intl';

import { useActivityTree } from '@/features/activities';
import {
  Button,
  Checkbox,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ScrollArea,
} from '@dayopt/components';

interface SegmentEditPopoverProps {
  trigger: React.ReactNode;
  /** 新規作成時は空文字列。編集時は既存名 */
  initialName?: string;
  initialActivityIds?: readonly string[];
  isSubmitting: boolean;
  onSubmit: (input: { name: string; activityIds: string[] }) => void;
  align?: 'start' | 'end';
  side?: 'top' | 'right' | 'bottom' | 'left';
}

/**
 * セグメント作成・編集用の軽量 popover（#2181 Step 5）。
 *
 * 保存させるのはアクティビティの集合だけ（#2162 §6-4）。期間・指標・グルーピングは
 * 持たせない — この popover に期間ピッカーやグルーピング選択を足さないこと自体が歯止め。
 */
export function SegmentEditPopover({
  trigger,
  initialName = '',
  initialActivityIds = [],
  isSubmitting,
  onSubmit,
  align = 'start',
  side = 'right',
}: SegmentEditPopoverProps) {
  const t = useTranslations('calendar.stats.review.segments');
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialName);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(initialActivityIds));
  const { data: tree } = useActivityTree();

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (next) {
        setName(initialName);
        setSelectedIds(new Set(initialActivityIds));
      }
    },
    [initialActivityIds, initialName],
  );

  const toggleActivity = useCallback((activityId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(activityId)) next.delete(activityId);
      else next.add(activityId);
      return next;
    });
  }, []);

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0 && selectedIds.size > 0 && !isSubmitting;

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;
    onSubmit({ name: trimmedName, activityIds: [...selectedIds] });
    setOpen(false);
  }, [canSubmit, onSubmit, selectedIds, trimmedName]);

  const categoryGroups = useMemo(() => tree?.categories ?? [], [tree]);
  const uncategorized = tree?.uncategorized ?? [];

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align={align} side={side} className="w-72 p-3">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('namePlaceholder')}
            aria-label={t('title')}
          />
          <ScrollArea className="h-48 rounded-lg border">
            <div className="flex flex-col gap-1 p-2">
              {categoryGroups.map((group) => (
                <div key={group.category.id} className="flex flex-col gap-1">
                  <p className="text-muted-foreground px-1 pt-1 text-xs font-medium">
                    {group.category.name}
                  </p>
                  {group.activities.map((activity) => (
                    <label
                      key={activity.id}
                      className="hover:bg-state-hover flex min-h-9 items-center gap-2 rounded-lg px-1 text-sm"
                    >
                      <Checkbox
                        checked={selectedIds.has(activity.id)}
                        onCheckedChange={() => toggleActivity(activity.id)}
                      />
                      <span className="min-w-0 flex-1 truncate">{activity.name}</span>
                    </label>
                  ))}
                </div>
              ))}
              {uncategorized.map((activity) => (
                <label
                  key={activity.id}
                  className="hover:bg-state-hover flex min-h-9 items-center gap-2 rounded-lg px-1 text-sm"
                >
                  <Checkbox
                    checked={selectedIds.has(activity.id)}
                    onCheckedChange={() => toggleActivity(activity.id)}
                  />
                  <span className="min-w-0 flex-1 truncate">{activity.name}</span>
                </label>
              ))}
            </div>
          </ScrollArea>
          <Button type="submit" variant="primary" size="sm" disabled={!canSubmit}>
            {t('title')}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
