'use client';

/**
 * PaletteAddPopover — タグ + duration を選んでパレットにピン追加
 *
 * サイドバー Palette セクションの「+」ボタンから開く Popover。
 */

import { useState } from 'react';

import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTags } from '@/features/tags';

import { usePaletteMutations } from '../hooks/usePaletteMutations';

const DURATION_PRESETS = [
  { value: 15, label: '15m' },
  { value: 30, label: '30m' },
  { value: 45, label: '45m' },
  { value: 60, label: '1h' },
  { value: 90, label: '1h30m' },
  { value: 120, label: '2h' },
] as const;

/** パレットにピン追加する Popover（タグ選択 + duration 選択 + 追加ボタン） */
export function PaletteAddPopover() {
  const t = useTranslations();
  const { data: tags } = useTags();
  const { pinItem, isPinning } = usePaletteMutations();

  const [open, setOpen] = useState(false);
  const [selectedTagId, setSelectedTagId] = useState<string>('');
  const [selectedDuration, setSelectedDuration] = useState<string>('');

  const canSubmit = selectedTagId !== '' && selectedDuration !== '' && !isPinning;

  const handleSubmit = () => {
    if (!canSubmit) return;
    pinItem(selectedTagId, Number(selectedDuration));
    setSelectedTagId('');
    setSelectedDuration('');
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" icon className="size-6" aria-label={t('sidebar.palette.add')}>
          <Plus className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 space-y-3 p-3" side="right" align="start">
        {/* タグ選択 */}
        <div className="space-y-1">
          <label className="text-muted-foreground text-xs font-medium">
            {t('sidebar.palette.tagLabel')}
          </label>
          <Select value={selectedTagId} onValueChange={setSelectedTagId}>
            <SelectTrigger size="sm" className="w-full">
              <SelectValue placeholder={t('sidebar.palette.tagPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {(tags ?? [])
                .filter((tag) => tag.is_active)
                .map((tag) => (
                  <SelectItem key={tag.id} value={tag.id}>
                    <span className="flex items-center gap-2">
                      <span
                        className={`size-2.5 shrink-0 rounded-full bg-tag-${tag.color ?? 'gray'}`}
                        aria-hidden="true"
                      />
                      {tag.name}
                    </span>
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        {/* Duration 選択 */}
        <div className="space-y-1">
          <label className="text-muted-foreground text-xs font-medium">
            {t('sidebar.palette.durationLabel')}
          </label>
          <Select value={selectedDuration} onValueChange={setSelectedDuration}>
            <SelectTrigger size="sm" className="w-full">
              <SelectValue placeholder={t('sidebar.palette.durationPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {DURATION_PRESETS.map((preset) => (
                <SelectItem key={preset.value} value={String(preset.value)}>
                  {preset.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 追加ボタン */}
        <Button size="sm" className="w-full" disabled={!canSubmit} onClick={handleSubmit}>
          {t('sidebar.palette.add')}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
