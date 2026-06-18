'use client';

/**
 * インラインタグパレット
 *
 * カレンダーグリッド上でドラッグ確定後に表示される。
 * 選択範囲のハイライトをグリッド上に描画し、
 * TagQuickSelector（Drawer/Dialog）でタグ選択 → エントリ作成。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { toast } from '@/lib/toast';
import { useQueryClient } from '@tanstack/react-query';
import { format, isSameDay } from 'date-fns';
import { enUS, ja } from 'date-fns/locale';
import { useLocale, useTranslations } from 'next-intl';

import { buildNewEntryOverlapTarget } from '@/features/calendar/lib/overlap';
import { entryTintColor, useEntryMutations } from '@/features/entry';
import type { HoveredTagInfo } from '@/features/tags';
import {
  getTagColorClasses,
  resolveTagColor,
  TagIcon,
  TagQuickSelector,
  useCreateTag,
} from '@/features/tags';
import { formatTimeString } from '@/lib/date';
import { convertFromTimezone } from '@/lib/date/timezone';
import { useUserPreferences } from '@/lib/hooks/useUserPreferences';
import { logger } from '@/lib/logger';
import { useShellStore } from '@/lib/stores/useShellStore';
import { hasTwoLayerTimeConflict } from '@/lib/time/two-layer-overlap';
import { cn } from '@/lib/utils';

import { useHapticFeedback } from '../../../../../hooks/accessibility/useHapticFeedback';
import { useInlineCreateStore } from '../../../../../stores/useInlineCreateStore';

import { Z_INDEX } from '../../constants/grid.constants';
import { DRAG_CONSTANTS } from '../CalendarDragSelection/types';
import { ConflictOverlay } from '../ConflictOverlay';

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

/** InlineTagPalette コンポーネントのプロパティ */
interface InlineTagPaletteProps {
  /** 1時間あたりの高さ（px） */
  hourHeight: number;
  /** このカラムの日付（複数日ビューで対象カラムのみ表示するため） */
  date?: Date | undefined;
}

/** ドラッグ選択後にカレンダーグリッド上でタグ選択してエントリ作成するコンポーネント */
export function InlineTagPalette({ hourHeight, date }: InlineTagPaletteProps) {
  const pendingSelection = useInlineCreateStore.use.pendingSelection();
  const clearPendingSelection = useInlineCreateStore.use.clearPendingSelection();
  const updateSelectionTimes = useInlineCreateStore.use.updateSelectionTimes();
  const timezone = useUserPreferences((s) => s.timezone);
  const locale = useLocale();
  const t = useTranslations('tags');
  const tCalendar = useTranslations('calendar');
  const tEntry = useTranslations('entry');
  const { tap, impact } = useHapticFeedback();

  const queryClient = useQueryClient();
  const { createEntry, skipEntry } = useEntryMutations();
  const createTagMutation = useCreateTag({ showToast: false });
  const [isCreating, setIsCreating] = useState(false);
  const [hoveredTag, setHoveredTag] = useState<HoveredTagInfo | null>(null);
  const lockedRef = useRef(false);
  const highlightRef = useRef<HTMLDivElement>(null);

  // 選択後はホバークリアを無視（mouseLeaveでちらつかないように）
  const handleTagHover = useCallback((tag: HoveredTagInfo | null) => {
    if (tag === null && lockedRef.current) return;
    setHoveredTag(tag);
  }, []);

  // エントリ作成ハンドラー（タグ必須、タグ名をタイトルに設定）
  const handleCreate = useCallback(
    (tagId: string, tagName: string) => {
      if (!pendingSelection || isCreating) return;

      const {
        date: selDate,
        startHour,
        startMinute,
        endHour,
        endMinute,
        skipEntryIds,
      } = pendingSelection;
      // 「スキップして記録」経由: これからスキップする自動記録は衝突候補から除外する。
      const skipSet = new Set(skipEntryIds ?? []);

      // ローカル時刻 → UTC変換
      const localStart = new Date(
        selDate.getFullYear(),
        selDate.getMonth(),
        selDate.getDate(),
        startHour,
        startMinute,
      );
      const localEnd = new Date(
        selDate.getFullYear(),
        selDate.getMonth(),
        selDate.getDate(),
        endHour,
        endMinute,
      );

      const utcStart = convertFromTimezone(localStart, timezone);
      const utcEnd = convertFromTimezone(localEnd, timezone);

      // 事前 overlap 判定（TagSelector を開いている間の resize / 他クライアント更新による race を回避）
      const cachedLists = queryClient.getQueriesData<
        Array<{
          id: string;
          origin: string | null;
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
          if (skipSet.has(e.id)) continue;
          events.push({
            id: e.id,
            plannedStart: e.start_time,
            plannedEnd: e.end_time,
            actualStart: e.actual_start_time,
            actualEnd: e.actual_end_time,
          });
        }
      }
      const hasOverlap = hasTwoLayerTimeConflict(
        events,
        buildNewEntryOverlapTarget(utcStart, utcEnd),
      );
      if (hasOverlap) {
        toast.error(tEntry('errors.timeOverlap'));
        clearPendingSelection();
        return;
      }

      lockedRef.current = true;
      setIsCreating(true);

      logger.log('🏷️ InlineTagPalette: Creating entry', {
        start: utcStart.toISOString(),
        end: utcEnd.toISOString(),
        tagId,
        title: tagName,
      });

      // ハイライトを即座に消す（pendingSelectionの値は既にローカル変数に展開済み）
      clearPendingSelection();

      const runCreate = () =>
        createEntry.mutate(
          {
            title: tagName,
            start_time: utcStart.toISOString(),
            end_time: utcEnd.toISOString(),
            tagId,
          },
          {
            onSuccess: () => setIsCreating(false),
            onError: () => setIsCreating(false),
          },
        );

      // 「スキップして記録」: 記録の作成が確定するこの時点でだけ自動記録をスキップする。
      // ここまで来ていない（パレットを閉じた）場合は何もスキップしない。skip が失敗したら
      // slot が空かないため作成しない。
      if (skipSet.size > 0) {
        void (async () => {
          try {
            for (const id of skipSet) {
              await skipEntry.mutateAsync({ id });
            }
            runCreate();
          } catch {
            // skipEntry.onError が toast 済み。記録は作成しない
            setIsCreating(false);
          }
        })();
      } else {
        runCreate();
      }
    },
    [
      pendingSelection,
      isCreating,
      timezone,
      createEntry,
      skipEntry,
      clearPendingSelection,
      queryClient,
      tEntry,
    ],
  );

  // 新規タグ作成 → エントリ作成
  const handleCreateAndSelect = useCallback(
    async (name: string, color?: string | null, icon?: string | null, parentId?: string | null) => {
      if (!pendingSelection || isCreating) return;

      setIsCreating(true);
      try {
        const newTag = await createTagMutation.mutateAsync({
          name,
          color: resolveTagColor(color),
          icon: icon ?? undefined,
          parentId: parentId ?? undefined,
        });
        // mutateAsync resolved → handleCreate で続行
        handleCreate(newTag.id, name);
      } catch (err) {
        setIsCreating(false);
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('GROUP_NAME_CONFLICT') || message.includes('group_conflict')) {
          toast.error(t('errors.groupNameConflict'));
        } else if (message.includes('duplicate') || message.includes('already exists')) {
          toast.error(t('errors.duplicateName'));
        } else {
          toast.error(t('errors.createFailed'));
        }
      }
    },
    [pendingSelection, isCreating, createTagMutation, handleCreate, t],
  );

  // selector の open は pendingSelection と分離する。
  // 「+」で modal に遷移する時は selector を閉じつつ pendingSelection を保持する必要がある
  // (open={!!pendingSelection} だと selector が閉じず modal と nest してしまう)。
  const [waitingForModal, setWaitingForModal] = useState(false);
  const activeSheetType = useShellStore((s) => s.activeSheet?.type ?? null);
  const isTagCreateModalOpen = activeSheetType === 'tagCreate';

  // 派生 state: pending あり && modal が前にも後にもいない時だけ open
  const selectorOpen = !!pendingSelection && !isTagCreateModalOpen && !waitingForModal;

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open) return;
      queueMicrotask(() => {
        if (useShellStore.getState().activeSheet?.type === 'tagCreate') {
          // modal 遷移中: pendingSelection を保持し、selector を非表示にする flag を立てる
          setWaitingForModal(true);
        } else {
          // 通常 dismiss: pendingSelection を解放
          clearPendingSelection();
        }
      });
    },
    [clearPendingSelection],
  );

  // modal close 検知: activeSheet が tagCreate から離れたら waitingForModal を解除する。
  // 外部 store (Zustand) の変化に追随する subscribe 相当のため setState を許可する。
  useEffect(() => {
    if (!waitingForModal) return;
    if (isTagCreateModalOpen) return;
    queueMicrotask(() => setWaitingForModal(false));
  }, [waitingForModal, isTagCreateModalOpen]);

  // pending を modal-pending 状態で抱えている間、unmount または waitingForModal の解除で
  // 必ず pending を解放する (calendar 離脱で stale selection が残らないように)。
  // 成功 path は handleCreate が先に clearPendingSelection を呼ぶため idempotent。
  useEffect(() => {
    if (!waitingForModal) return;
    return () => clearPendingSelection();
  }, [waitingForModal, clearPendingSelection]);

  const timeFormat = useUserPreferences((s) => s.timeFormat);
  const [nowForPastCheck, setNowForPastCheck] = useState<number | null>(null);

  useEffect(() => {
    if (!pendingSelection) return;
    queueMicrotask(() => setNowForPastCheck(Date.now()));
  }, [pendingSelection]);

  // 現在の selection が他 entry と重なるかを live 判定（resize や外部更新に追随）。
  // 過去時間帯は保存時に自動で unplanned になるため、preview もダッシュ枠の unplanned 風に切替える。
  const isPast = (() => {
    if (nowForPastCheck === null) return false;
    if (!pendingSelection) return false;
    const { date: selDate, endHour, endMinute } = pendingSelection;
    const endLocal = new Date(
      selDate.getFullYear(),
      selDate.getMonth(),
      selDate.getDate(),
      endHour,
      endMinute,
    );
    return endLocal.getTime() <= nowForPastCheck;
  })();

  // hooks は早期 return より前で呼ぶ必要があるため、null セーフに書く。
  const hasConflict = useMemo(() => {
    if (!pendingSelection) return false;
    const { date: selDate, startHour, startMinute, endHour, endMinute } = pendingSelection;
    const startMin = startHour * 60 + startMinute;
    const endMin = endHour * 60 + endMinute;
    if (endMin <= startMin) return false;

    const localStart = new Date(
      selDate.getFullYear(),
      selDate.getMonth(),
      selDate.getDate(),
      startHour,
      startMinute,
    );
    const localEnd = new Date(
      selDate.getFullYear(),
      selDate.getMonth(),
      selDate.getDate(),
      endHour,
      endMinute,
    );
    const utcStart = convertFromTimezone(localStart, timezone);
    const utcEnd = convertFromTimezone(localEnd, timezone);

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

    return hasTwoLayerTimeConflict(events, buildNewEntryOverlapTarget(utcStart, utcEnd));
  }, [queryClient, pendingSelection, timezone]);

  // 日付が指定されている場合、対象日と一致するカラムのみ表示
  if (!pendingSelection) return null;
  if (date && !isSameDay(date, pendingSelection.date)) return null;

  const { startHour, startMinute, endHour, endMinute } = pendingSelection;
  const isPlannedGapSelection = pendingSelection.creationSource === 'planned-gap';

  // 選択範囲のピクセル計算
  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;
  const selectionTop = startMinutes * (hourHeight / 60);
  const selectionHeight = (endMinutes - startMinutes) * (hourHeight / 60);

  // 時間ラベル + 合計時間
  const timeLabel = `${formatTimeString(startHour, startMinute, timeFormat)} – ${formatTimeString(endHour, endMinute, timeFormat)}`;

  // タグピッカーヘッダー用の日付+時間ラベル（例: "3/30 (日) 14:00 – 15:30"）
  const dateFnsLocale = locale === 'ja' ? ja : enUS;
  const datePattern = locale === 'ja' ? 'M/d (E)' : 'E, MMM d';
  const pickerTimeLabel = `${format(pendingSelection.date, datePattern, { locale: dateFnsLocale })} ${timeLabel}`;

  // ホバー中タグの色を解決
  const accentColor = hoveredTag
    ? getTagColorClasses(hoveredTag.color).cssVar
    : 'var(--entry-default)';
  // EntryCard と同じ 18% color-mix tint を使い、確定後カードと背景色を揃える
  const tintColor = entryTintColor(accentColor);
  const displayName = hoveredTag?.name ?? tCalendar('event.selectTag');

  // 下端 handle: end time だけを 15 分単位で更新
  const handleResizeStart = (clientY: number) => {
    const baseEndMin = endMinutes;
    const minEndMin = startMinutes + 15;
    let lastEndMin = baseEndMin;

    const onMove = (event: PointerEvent) => {
      const deltaMin = Math.round(((event.clientY - clientY) * 60) / hourHeight / 15) * 15;
      const next = Math.max(minEndMin, Math.min(24 * 60, baseEndMin + deltaMin));
      if (next === lastEndMin) return;
      lastEndMin = next;
      updateSelectionTimes({ endHour: Math.floor(next / 60), endMinute: next % 60 });
      tap();
    };

    const onEnd = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onEnd);
      document.removeEventListener('pointercancel', onEnd);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onEnd);
    document.addEventListener('pointercancel', onEnd);
  };

  // 本体 long-press: 300ms 静止で move mode に入り、duration 維持で全体を移動
  const handleBodyPointerDown = (e: React.PointerEvent) => {
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const baseStartMin = startMinutes;
    const duration = endMinutes - startMinutes;
    let phase: 'pending' | 'moving' | 'cancelled' = 'pending';
    let lastStartMin = baseStartMin;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onEnd);
      document.removeEventListener('pointercancel', onEnd);
    };

    const onMove = (event: PointerEvent) => {
      if (phase === 'cancelled') return;
      if (phase === 'pending') {
        const dx = Math.abs(event.clientX - startClientX);
        const dy = Math.abs(event.clientY - startClientY);
        if (
          dx > DRAG_CONSTANTS.LONG_PRESS_MOVE_THRESHOLD ||
          dy > DRAG_CONSTANTS.LONG_PRESS_VERTICAL_THRESHOLD
        ) {
          phase = 'cancelled';
          cleanup();
        }
        return;
      }
      // moving
      const deltaMin = Math.round(((event.clientY - startClientY) * 60) / hourHeight / 15) * 15;
      const next = Math.max(0, Math.min(24 * 60 - duration, baseStartMin + deltaMin));
      if (next === lastStartMin) return;
      lastStartMin = next;
      const nextEnd = next + duration;
      updateSelectionTimes({
        startHour: Math.floor(next / 60),
        startMinute: next % 60,
        endHour: Math.floor(nextEnd / 60),
        endMinute: nextEnd % 60,
      });
      tap();
    };

    const onEnd = () => {
      cleanup();
    };

    timer = setTimeout(() => {
      phase = 'moving';
      impact();
    }, DRAG_CONSTANTS.LONG_PRESS_DURATION);

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onEnd);
    document.addEventListener('pointercancel', onEnd);
  };

  return (
    <>
      {/* 選択範囲ハイライト（カレンダーグリッド上） */}
      <div
        data-tag-palette
        className="pointer-events-none absolute right-0 left-0"
        style={{ zIndex: Z_INDEX.POPOVER }}
      >
        <div
          ref={highlightRef}
          className={cn(
            'animate-in fade-in-0 pointer-events-auto absolute flex transition-colors duration-150 motion-reduce:animate-none',
            'rounded-r-lg',
          )}
          style={{
            top: selectionTop,
            left: isPlannedGapSelection ? '50%' : 0,
            right: 0,
            height: selectionHeight,
            touchAction: 'none',
            // past（unplanned 風）も確定後カードと同じ作り: 左アクセント + tint 塗り + 3 辺破線
            ...(isPast && !hasConflict
              ? {
                  borderTop: `2px dashed ${accentColor}`,
                  borderRight: `2px dashed ${accentColor}`,
                  borderBottom: `2px dashed ${accentColor}`,
                  borderRadius: '0 8px 8px 0',
                }
              : {}),
          }}
          onPointerDown={handleBodyPointerDown}
        >
          {hasConflict ? (
            // drag/resize/新規選択と同一の ConflictOverlay に統一。
            // ブロックは rounded-r-lg（左角四角 + 3px アクセント）なので左角を四角にして全面を覆う。
            <ConflictOverlay
              message={tEntry('errors.timeOverlap')}
              timeLabel={timeLabel}
              compact={selectionHeight < 40}
              className="absolute inset-0 rounded-l-none"
            />
          ) : (
            <>
              {/* past は確定後の unplanned と同じ左アクセント、upcoming は文言位置合わせのスペーサー。 */}
              <div
                className="shrink-0 transition-colors duration-150"
                style={{ width: '3px', backgroundColor: isPast ? accentColor : tintColor }}
              />
              {/* カード本体 — past も確定後カードと同じ tint 塗り */}
              <div
                className={cn(
                  'min-w-0 flex-1 overflow-hidden transition-colors duration-150',
                  'rounded-r-lg',
                )}
                style={{ backgroundColor: tintColor }}
              >
                {selectionHeight < 40 ? (
                  <div className="flex h-full items-center gap-1 px-2">
                    {hoveredTag?.icon && (
                      <TagIcon
                        icon={hoveredTag.icon}
                        color={hoveredTag.color}
                        size="sm"
                        className="shrink-0"
                      />
                    )}
                    <span
                      className={cn(
                        'truncate text-xs',
                        hoveredTag
                          ? 'text-foreground font-normal'
                          : 'text-muted-foreground tabular-nums',
                      )}
                    >
                      {hoveredTag ? displayName : timeLabel}
                    </span>
                  </div>
                ) : (
                  <div className="flex h-full flex-col gap-1 p-2">
                    <div className="flex items-center gap-1">
                      {hoveredTag?.icon && (
                        <TagIcon
                          icon={hoveredTag.icon}
                          color={hoveredTag.color}
                          size="sm"
                          className="shrink-0"
                        />
                      )}
                      <span
                        className={cn(
                          'min-w-0 truncate text-sm leading-tight font-normal',
                          hoveredTag ? 'text-foreground' : 'text-muted-foreground',
                        )}
                      >
                        {displayName}
                      </span>
                    </div>
                    <span className="text-muted-foreground text-xs leading-tight tabular-nums">
                      {timeLabel}
                    </span>
                  </div>
                )}
              </div>
            </>
          )}
          {/* 下端 visual indicator pill */}
          <span
            aria-hidden
            className="bg-muted-foreground pointer-events-none absolute bottom-0 left-1/2 h-1 w-8 -translate-x-1/2 rounded-full"
            style={{ zIndex: 1 }}
          />
          {/* 下端 invisible resize handle (44px touch target) */}
          <div
            role="slider"
            tabIndex={0}
            aria-label={tCalendar('event.adjustEndTime')}
            aria-orientation="vertical"
            aria-valuenow={endMinutes - startMinutes}
            aria-valuemin={15}
            aria-valuemax={24 * 60}
            className="pointer-events-auto absolute right-0 left-0 cursor-ns-resize"
            style={{
              height: '44px',
              bottom: '-40px',
              zIndex: 2,
              touchAction: 'none',
            }}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              handleResizeStart(event.clientY);
            }}
          />
        </div>
      </div>

      {/* タグ選択パネル */}
      <TagQuickSelector
        open={selectorOpen}
        onOpenChange={handleOpenChange}
        onSelect={handleCreate}
        onCreateAndSelect={handleCreateAndSelect}
        onTagHover={handleTagHover}
        anchorRef={highlightRef}
        timeLabel={pickerTimeLabel}
      />
    </>
  );
}
