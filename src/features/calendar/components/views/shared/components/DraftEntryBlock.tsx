'use client';

import { useCallback } from 'react';

import { useTranslations } from 'next-intl';

import { ColonTagLabel } from '@/lib/components/ui/colon-tag-label';
import { formatTimeString } from '@/lib/date';
import { useCalendarSettingsStore } from '@/lib/stores/useCalendarSettingsStore';
import { getTagColorClasses } from '@/lib/tag-colors';

import { useTagDraftStore, type TagDraft } from '../../../../stores/useTagDraftStore';
import { Z_INDEX } from '../constants/grid.constants';

interface DraftEntryBlockProps {
  /** この列が表示する日付（draft.date と同日のときだけ render する想定） */
  draft: TagDraft;
  hourHeight: number;
}

/**
 * Tag タップで開く draft entry の calendar 上のプレビュー。
 *
 * - InlineTagPalette と同じ視覚（左 accent strip + 右 tinted card）
 * - 下端に drawer pill 風の resize handle。drag で end time を更新
 * - drag 中は 15 分粒度に snap、24:00 を超えない・start より小さくならない
 * - クリックは popover 側の interaction を阻害しないよう pointer-events: none を基本にし、
 *   resize handle のみ pointer-events: auto
 */
export function DraftEntryBlock({ draft, hourHeight }: DraftEntryBlockProps) {
  const t = useTranslations();
  const timeFormat = useCalendarSettingsStore((s) => s.timeFormat);
  const updateTimes = useTagDraftStore((s) => s.updateTimes);

  const [startH, startM] = parseHHMM(draft.startTime);
  const [endH, endM] = parseHHMM(draft.endTime);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  const top = startMinutes * (hourHeight / 60);
  const height = Math.max(20, (endMinutes - startMinutes) * (hourHeight / 60));

  const accentColor = getTagColorClasses(draft.tag.color).cssVar;
  const tintColor = getTagColorClasses(draft.tag.color).cssVarTint;

  const timeLabel = `${formatTimeString(startH, startM, timeFormat)} – ${formatTimeString(endH, endM, timeFormat)}`;

  const handleResizeStart = useCallback(
    (clientY: number) => {
      const startEndMinutes = endMinutes;
      const minEndMinutes = startMinutes + 15;

      const handleMove = (event: PointerEvent) => {
        const deltaPx = event.clientY - clientY;
        const deltaMinutesRaw = (deltaPx / hourHeight) * 60;
        // 15 分粒度に snap
        const snappedDelta = Math.round(deltaMinutesRaw / 15) * 15;
        const next = Math.max(minEndMinutes, Math.min(24 * 60, startEndMinutes + snappedDelta));
        if (next === endMinutes) return;
        const nh = Math.floor(next / 60);
        const nm = next % 60;
        updateTimes({ endTime: `${pad(nh)}:${pad(nm)}` });
      };

      const handleUp = () => {
        document.removeEventListener('pointermove', handleMove);
        document.removeEventListener('pointerup', handleUp);
        document.removeEventListener('pointercancel', handleUp);
      };

      document.addEventListener('pointermove', handleMove);
      document.addEventListener('pointerup', handleUp);
      document.addEventListener('pointercancel', handleUp);
    },
    [endMinutes, hourHeight, startMinutes, updateTimes],
  );

  return (
    <div
      data-tag-draft-block
      className="pointer-events-none absolute right-2 left-0"
      style={{ zIndex: Z_INDEX.POPOVER }}
    >
      <div
        className="animate-in fade-in-0 absolute right-0 left-0 flex rounded-r-lg motion-reduce:animate-none"
        style={{ top, height }}
      >
        {/* 左 accent strip */}
        <div className="shrink-0" style={{ width: '3px', backgroundColor: accentColor }} />
        {/* card 本体 */}
        <div
          className="relative min-w-0 flex-1 overflow-hidden rounded-r-lg"
          style={{ backgroundColor: tintColor }}
        >
          {height < 40 ? (
            <div className="flex h-full items-center px-2">
              <span className="text-foreground truncate text-xs font-normal">
                <ColonTagLabel name={draft.tag.name} />
              </span>
            </div>
          ) : (
            <div className="flex h-full flex-col gap-1 p-2">
              <span className="text-foreground text-sm leading-tight font-normal">
                <ColonTagLabel name={draft.tag.name} />
              </span>
              <span className="text-muted-foreground text-xs leading-tight tabular-nums">
                {timeLabel}
              </span>
            </div>
          )}
        </div>
        {/* resize pill — pointer-events を有効化 */}
        <span
          aria-hidden
          className="bg-muted-foreground pointer-events-none absolute bottom-0 left-1/2 h-1 w-8 -translate-x-1/2 rounded-full opacity-100"
          style={{ zIndex: 1 }}
        />
        <div
          role="slider"
          tabIndex={0}
          aria-label={t('calendar.event.adjustEndTime')}
          aria-orientation="vertical"
          aria-valuenow={endMinutes - startMinutes}
          aria-valuemin={15}
          aria-valuemax={24 * 60}
          className="pointer-events-auto absolute right-0 left-0 cursor-ns-resize"
          style={{
            height: '44px',
            bottom: '-40px',
            zIndex: 2,
          }}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleResizeStart(e.clientY);
          }}
        />
      </div>
    </div>
  );
}

function parseHHMM(value: string): [number, number] {
  const [h, m] = value.split(':').map(Number);
  return [h ?? 0, m ?? 0];
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
