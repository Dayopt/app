'use client';

/**
 * PaletteAddPopover — タグ + duration を選んでパレットにピン追加
 *
 * サイドバー Palette セクションの「+」ボタンから開く Popover。
 */

import { useCallback, useMemo, useState } from 'react';

import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { ActionFooter } from '@/components/ui/action-footer';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTags } from '@/features/tags';

import { DURATION_PRESETS } from '../constants';
import { usePaletteMutations } from '../hooks/usePaletteMutations';
import type { PaletteItem } from '../hooks/usePaletteQuery';

interface PaletteAddPopoverProps {
  pinnedItems?: PaletteItem[];
}

/** パレットにピン追加する Popover（タグ選択 + duration 選択 + 追加ボタン） */
export function PaletteAddPopover({ pinnedItems }: PaletteAddPopoverProps) {
  const t = useTranslations();
  const { data: tags } = useTags();
  const { pinItem, isPinning } = usePaletteMutations();

  const [open, setOpen] = useState(false);
  const [selectedTagId, setSelectedTagId] = useState<string>('');
  const [selectedDuration, setSelectedDuration] = useState<string>('');

  // 既存ピン留めの組み合わせセット
  const pinnedSet = useMemo(
    () => new Set((pinnedItems ?? []).map((p) => `${p.tag_id}:${p.duration_minutes}`)),
    [pinnedItems],
  );

  const isDuplicate =
    selectedTagId !== '' &&
    selectedDuration !== '' &&
    pinnedSet.has(`${selectedTagId}:${Number(selectedDuration)}`);

  const canSubmit = selectedTagId !== '' && selectedDuration !== '' && !isDuplicate;

  const handleSubmit = useCallback(() => {
    if (!canSubmit || isPinning) return;
    pinItem(selectedTagId, Number(selectedDuration));
    setSelectedTagId('');
    setSelectedDuration('');
    setOpen(false);
  }, [canSubmit, isPinning, pinItem, selectedTagId, selectedDuration]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setSelectedTagId('');
    setSelectedDuration('');
  }, []);

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) {
      setSelectedTagId('');
      setSelectedDuration('');
    }
  }, []);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" icon className="size-8" aria-label={t('sidebar.palette.add')}>
          <Plus className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-4" side="right" align="start">
        <FieldGroup className="mb-6">
          {/* タグ選択 */}
          <Field>
            <FieldLabel>{t('sidebar.palette.tagLabel')}</FieldLabel>
            <Select value={selectedTagId} onValueChange={setSelectedTagId}>
              <SelectTrigger className="w-full">
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
          </Field>

          {/* Duration 選択 */}
          <Field>
            <FieldLabel>{t('sidebar.palette.durationLabel')}</FieldLabel>
            <Select value={selectedDuration} onValueChange={setSelectedDuration}>
              <SelectTrigger className="w-full">
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
          </Field>

          {/* 重複エラー */}
          {isDuplicate && <FieldError noPrefix>{t('sidebar.palette.duplicateError')}</FieldError>}
        </FieldGroup>

        {/* Footer — tag-create-modal と同じ ActionFooter パターン */}
        <ActionFooter>
          <Button variant="outline" onClick={handleClose} aria-disabled={isPinning}>
            {t('common.actions.cancel')}
          </Button>
          <Button aria-disabled={!canSubmit} isLoading={isPinning} onClick={handleSubmit}>
            {t('sidebar.palette.add')}
          </Button>
        </ActionFooter>
      </PopoverContent>
    </Popover>
  );
}
