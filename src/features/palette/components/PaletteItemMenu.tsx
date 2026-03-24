'use client';

/**
 * PaletteItemMenu — パレットアイテムのコンテキストメニュー
 *
 * BlockItem の menuSlot に注入。duration 変更と削除を提供。
 */

import { MoreHorizontal, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { blockMenuButtonCn } from '@/shell/components/sidebar';

import { DURATION_PRESETS } from '../constants';

interface PaletteItemMenuProps {
  itemId: string;
  currentDuration: number;
  onChangeDuration: (id: string, durationMinutes: number) => void;
  onRemove: (id: string) => void;
}

/** パレットアイテムの DropdownMenu（duration 変更 + 削除） */
export function PaletteItemMenu({
  itemId,
  currentDuration,
  onChangeDuration,
  onRemove,
}: PaletteItemMenuProps) {
  const t = useTranslations();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={blockMenuButtonCn}
          aria-label={t('common.actions.options')}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="start">
        <DropdownMenuRadioGroup
          value={String(currentDuration)}
          onValueChange={(value) => onChangeDuration(itemId, Number(value))}
        >
          {DURATION_PRESETS.map((preset) => (
            <DropdownMenuRadioItem key={preset.value} value={String(preset.value)}>
              {preset.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => onRemove(itemId)}>
          <Trash2 />
          {t('sidebar.palette.remove')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
