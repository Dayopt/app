'use client';

import { useCallback, useMemo } from 'react';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { ColonTagLabel } from '@/lib/components/ui/colon-tag-label';
import { formatTimeString } from '@/lib/date';
import { useCalendarSettingsStore } from '@/lib/stores/useCalendarSettingsStore';
import { getTagColorClasses } from '@/lib/tag-colors';
import { hasTwoLayerTimeConflict } from '@/lib/time/two-layer-overlap';
import { cn } from '@/lib/utils';

import { useTagDraftStore, type TagDraft } from '../../../../stores/useTagDraftStore';
import { Z_INDEX } from '../constants/grid.constants';

/** entries.list の cached query を判定する predicate（tRPC v11 key 形式） */
function isEntriesListQuery(query: { queryKey: unknown }): boolean {
  const key = query.queryKey;
  return (
    Array.isArray(key) &&
    key.length >= 1 &&
    Array.isArray(key[0]) &&
    key[0][0] === 'entries' &&
    key[0][1] === 'list'
  );
}

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
 * - 他 entry と時間が重なる時は赤リング（drag ghost と同じ規範）
 */
export function DraftEntryBlock({ draft, hourHeight }: DraftEntryBlockProps) {
  const t = useTranslations();
  const timeFormat = useCalendarSettingsStore((s) => s.timeFormat);
  const updateTimes = useTagDraftStore((s) => s.updateTimes);
  const queryClient = useQueryClient();

  const [startH, startM] = parseHHMM(draft.startTime);
  const [endH, endM] = parseHHMM(draft.endTime);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  const top = startMinutes * (hourHeight / 60);
  const height = Math.max(20, (endMinutes - startMinutes) * (hourHeight / 60));

  const accentColor = getTagColorClasses(draft.tag.color).cssVar;
  const tintColor = getTagColorClasses(draft.tag.color).cssVarTint;

  const timeLabel = `${formatTimeString(startH, startM, timeFormat)} – ${formatTimeString(endH, endM, timeFormat)}`;

  // 過去の時間帯は保存時に自動で unplanned になるため、preview もダッシュ枠の unplanned 風に切替える。
  // Date.now() を毎レンダー読むのは preview の存在中に past 境界を跨ぐ稀ケースに追随するため許容。
  // eslint-disable-next-line react-hooks/purity -- transient preview component, no observable side effect
  const nowForPastCheck = Date.now();
  const isPastEndDate = new Date(draft.date);
  isPastEndDate.setHours(endH, endM, 0, 0);
  const isPast = isPastEndDate.getTime() <= nowForPastCheck;

  // 他 entry と時間が重なるか判定（drag ghost と同じく赤リングを描画する用）
  const hasConflict = useMemo(() => {
    if (endMinutes <= startMinutes) return false;
    const startDate = new Date(draft.date);
    startDate.setHours(startH, startM, 0, 0);
    const endDate = new Date(draft.date);
    endDate.setHours(endH, endM, 0, 0);

    const cachedLists = queryClient.getQueriesData<
      Array<{
        id: string;
        start_time: string | null;
        end_time: string | null;
        actual_start_time: string | null;
        actual_end_time: string | null;
      }>
    >({ predicate: isEntriesListQuery });

    const seen = new Set<string>();
    const events: Array<{
      id: string;
      plannedStart: string | null;
      plannedEnd: string | null;
      actualStart: string | null;
      actualEnd: string | null;
    }> = [];
    for (const [, data] of cachedLists) {
      if (!data) continue;
      for (const e of data) {
        if (seen.has(e.id)) continue;
        seen.add(e.id);
        events.push({
          id: e.id,
          plannedStart: e.start_time,
          plannedEnd: e.end_time,
          actualStart: e.actual_start_time,
          actualEnd: e.actual_end_time,
        });
      }
    }

    // past は unplanned で planned 範囲なし、future は planned で planned/actual 両方持つ。
    // hasTwoLayerTimeConflict は target.actualStart/End が必須なので future planned 作成でも
    // 同じ範囲を actual に mirror する（server も create 時に actual を planned に mirror する）。
    return hasTwoLayerTimeConflict(events, {
      id: '',
      plannedStart: isPast ? null : startDate.toISOString(),
      plannedEnd: isPast ? null : endDate.toISOString(),
      actualStart: startDate.toISOString(),
      actualEnd: endDate.toISOString(),
    });
  }, [queryClient, draft.date, startH, startM, endH, endM, startMinutes, endMinutes, isPast]);

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
        className={cn(
          'animate-in fade-in-0 absolute right-0 left-0 flex motion-reduce:animate-none',
          isPast && !hasConflict ? 'rounded-lg' : 'rounded-r-lg',
        )}
        style={{
          top,
          height,
          ...(isPast && !hasConflict
            ? { border: `2px dashed ${accentColor}`, borderRadius: '8px' }
            : {}),
        }}
      >
        {/* 左 accent strip — past unplanned 風の時は描画しない */}
        {!(isPast && !hasConflict) && (
          <div
            className={cn('shrink-0', hasConflict && 'bg-destructive')}
            style={{ width: '3px', ...(hasConflict ? {} : { backgroundColor: accentColor }) }}
          />
        )}
        {/* card 本体 — 重複時は destructive-tint、past は透明背景（破線枠で囲うのみ） */}
        <div
          className={cn(
            'relative min-w-0 flex-1 overflow-hidden',
            isPast && !hasConflict ? 'rounded-lg' : 'rounded-r-lg',
            hasConflict && 'bg-destructive-tint',
          )}
          style={
            hasConflict || (isPast && !hasConflict) ? undefined : { backgroundColor: tintColor }
          }
        >
          {height < 40 ? (
            <div className="flex h-full items-center px-2">
              <span
                className={cn(
                  'truncate text-xs font-normal',
                  hasConflict ? 'text-destructive' : 'text-foreground',
                )}
              >
                {hasConflict ? (
                  t('entry.errors.timeOverlap')
                ) : (
                  <ColonTagLabel name={draft.tag.name} />
                )}
              </span>
            </div>
          ) : (
            <div className="flex h-full flex-col gap-1 p-2">
              <span
                className={cn(
                  'text-sm leading-tight font-normal',
                  hasConflict ? 'text-destructive' : 'text-foreground',
                )}
              >
                {hasConflict ? (
                  t('entry.errors.timeOverlap')
                ) : (
                  <ColonTagLabel name={draft.tag.name} />
                )}
              </span>
              <span
                className={cn(
                  'text-xs leading-tight tabular-nums',
                  hasConflict ? 'text-destructive' : 'text-muted-foreground',
                )}
              >
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
