'use client';

/**
 * 時間フィールドの状態管理
 *
 * scheduleDate, startTime, endTime, actualStartTime, actualEndTime
 * の local state と変更ハンドラーを提供。
 *
 * 保存は useDebouncedSave に委譲。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { localTimeToUTCISO, parseISOToUserTimezone } from '@/lib/date';
import { useUserPreferences } from '@/lib/hooks/useUserPreferences';
import { hasTwoLayerTimeConflict } from '@dayopt/domain';
import type { EntryWithTags } from '../../../types/entry';

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

interface UseTimeFieldsOptions {
  entry: EntryWithTags | null;
  entryId: string | null;
  /** useDebouncedSave.save — デバウンス保存 */
  save: (fields: Record<string, string | number | boolean | null | undefined>) => void;
  /** useDebouncedSave.saveImmediate — 即時保存 */
  saveImmediate: (fields: Record<string, string | number | boolean | null | undefined>) => void;
}

/** HH:MM 形式の時間文字列を生成 */
function toHHMM(date: Date): string {
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

function toISOForDate(date: Date, time: string, timezone: string): string | null {
  if (!time) return null;
  const [hours, minutes] = time.split(':').map(Number);
  return localTimeToUTCISO(date, hours ?? 0, minutes ?? 0, timezone);
}

/** Inspectorの時間フィールド状態管理フック（scheduleDate/startTime/endTime/actualTime対応）
 * @param options - entry, entryId, save, saveImmediate
 * @returns scheduleDate, startTime, endTime, actualStartTime, actualEndTime および各ハンドラー
 */
export function useTimeFields({ entry, entryId, save, saveImmediate }: UseTimeFieldsOptions) {
  const timezone = useUserPreferences((state) => state.timezone);
  const queryClient = useQueryClient();

  // UI refs
  const titleRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  // ユーザー操作による未保存のローカル変更を保護するフラグ
  // entry sync useEffect がバックグラウンド refetch で古いデータに上書きするのを防ぐ
  const localDirtyRef = useRef(false);
  // handleConfirmTimeChange が saveImmediate で直接保存する間、
  // autoAdjust 経由の handleEndTimeChange.save() を抑制するフラグ
  const suppressSaveRef = useRef(false);

  // Local state
  const [timeConflictError, setTimeConflictError] = useState(false);
  const [scheduleDate, setScheduleDate] = useState<Date | undefined>();
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [actualStartTime, setActualStartTime] = useState<string | null>(null);
  const [actualEndTime, setActualEndTime] = useState<string | null>(null);

  // entry データからローカル state を初期化
  useEffect(() => {
    if (localDirtyRef.current) return; // ユーザーの未保存変更を保護
    if (entry && 'id' in entry) {
      const dateSource = entry.start_time ?? entry.actual_start_time;
      if (dateSource) {
        const date = parseISOToUserTimezone(dateSource, timezone);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- entryデータからのタイムゾーン変換結果を同期
        setScheduleDate(date);
      } else {
        setScheduleDate(undefined);
      }

      if (entry.start_time) {
        const date = parseISOToUserTimezone(entry.start_time, timezone);
        setStartTime(toHHMM(date));
      } else {
        setStartTime('');
      }

      if (entry.end_time) {
        const date = parseISOToUserTimezone(entry.end_time, timezone);
        setEndTime(toHHMM(date));
      } else {
        setEndTime('');
      }

      if (entry.actual_start_time) {
        const actualStart = parseISOToUserTimezone(entry.actual_start_time, timezone);
        setActualStartTime(toHHMM(actualStart));
      } else {
        setActualStartTime(null);
      }

      if (entry.actual_end_time) {
        const actualEnd = parseISOToUserTimezone(entry.actual_end_time, timezone);
        setActualEndTime(toHHMM(actualEnd));
      } else {
        setActualEndTime(null);
      }
    } else if (!entry) {
      setScheduleDate(undefined);
      setStartTime('');
      setEndTime('');
      setActualStartTime(null);
      setActualEndTime(null);
    }
  }, [entry, timezone]);

  // Focus title on open
  useEffect(() => {
    if (titleRef.current) {
      const timer = setTimeout(() => {
        titleRef.current?.focus();
        titleRef.current?.select();
      }, 100);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [entryId]);

  // 同期 overlap 判定：onChange→save の race を回避するため、useEffect ではなく
  // 各 handler の save 直前にも直接呼ぶ。
  const checkConflict = useCallback(
    (proposed: {
      plannedStart: string | null;
      plannedEnd: string | null;
      actualStart: string | null;
      actualEnd: string | null;
    }) => {
      if (!entryId) return false;
      if (
        (!proposed.plannedStart || !proposed.plannedEnd) &&
        (!proposed.actualStart || !proposed.actualEnd)
      ) {
        return false;
      }

      // calendar は date-filtered key を使うため、predicate で全 entries.list cache を集める。
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
      const collected: Array<{
        id: string;
        start_time: string | null;
        end_time: string | null;
        actual_start_time: string | null;
        actual_end_time: string | null;
      }> = [];
      for (const [, data] of cachedLists) {
        if (!data) continue;
        for (const e of data) {
          if (seen.has(e.id)) continue;
          seen.add(e.id);
          collected.push(e);
        }
      }

      return hasTwoLayerTimeConflict(
        collected.map((e) => ({
          id: e.id,
          plannedStart: e.start_time,
          plannedEnd: e.end_time,
          actualStart: e.actual_start_time,
          actualEnd: e.actual_end_time,
        })),
        {
          id: entryId,
          plannedStart: entry?.origin === 'planned' ? proposed.plannedStart : null,
          plannedEnd: entry?.origin === 'planned' ? proposed.plannedEnd : null,
          actualStart: proposed.actualStart,
          actualEnd: proposed.actualEnd,
          forbidFutureActual: entry?.origin === 'unplanned',
        },
      );
    },
    [entryId, entry?.origin, queryClient],
  );

  // リアルタイム重複チェック（alert 表示用、setState を伴うため useEffect で実行）
  useEffect(() => {
    if (!scheduleDate || !entryId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- tRPCキャッシュ参照を伴う重複チェック結果の反映
      setTimeConflictError(false);
      return;
    }

    const hasOverlap = checkConflict({
      plannedStart: toISOForDate(scheduleDate, startTime, timezone),
      plannedEnd: toISOForDate(scheduleDate, endTime, timezone),
      actualStart: toISOForDate(scheduleDate, actualStartTime ?? '', timezone),
      actualEnd: toISOForDate(scheduleDate, actualEndTime ?? '', timezone),
    });

    setTimeConflictError(hasOverlap);
  }, [
    scheduleDate,
    startTime,
    endTime,
    actualStartTime,
    actualEndTime,
    entryId,
    timezone,
    checkConflict,
  ]);

  // --- ハンドラー ---

  const handleScheduleDateChange = useCallback(
    (date: Date | undefined) => {
      setScheduleDate(date);

      if (!date) return;

      if (entry?.origin === 'unplanned') {
        const actualStartISO = toISOForDate(date, actualStartTime ?? '', timezone);
        const actualEndISO = toISOForDate(date, actualEndTime ?? '', timezone);
        if (actualStartISO && actualEndISO) {
          if (new Date(actualEndISO).getTime() > Date.now()) {
            setTimeConflictError(true);
            return;
          }
          if (
            checkConflict({
              plannedStart: null,
              plannedEnd: null,
              actualStart: actualStartISO,
              actualEnd: actualEndISO,
            })
          ) {
            setTimeConflictError(true);
            return;
          }
          save({
            actual_start_time: actualStartISO,
            actual_end_time: actualEndISO,
          });
        }
        return;
      }

      const newStart = startTime ? toISOForDate(date, startTime, timezone) : null;
      const newEnd = endTime ? toISOForDate(date, endTime, timezone) : null;
      if (
        checkConflict({
          plannedStart: newStart,
          plannedEnd: newEnd,
          actualStart: toISOForDate(date, actualStartTime ?? '', timezone),
          actualEnd: toISOForDate(date, actualEndTime ?? '', timezone),
        })
      ) {
        setTimeConflictError(true);
        return;
      }

      if (startTime && endTime) {
        save({ start_time: newStart, end_time: newEnd });
      } else if (startTime) {
        save({ start_time: newStart });
      } else if (endTime) {
        save({ end_time: newEnd });
      }
    },
    [
      entry?.origin,
      actualStartTime,
      actualEndTime,
      startTime,
      endTime,
      save,
      timezone,
      checkConflict,
    ],
  );

  const handleStartTimeChange = useCallback(
    (time: string) => {
      localDirtyRef.current = true;
      setStartTime(time);

      if (suppressSaveRef.current) return;
      if (!scheduleDate) return;
      const isoValue = toISOForDate(scheduleDate, time, timezone);
      if (!isoValue) return;

      const conflict = checkConflict({
        plannedStart: isoValue,
        plannedEnd: toISOForDate(scheduleDate, endTime, timezone),
        actualStart: toISOForDate(scheduleDate, actualStartTime ?? '', timezone),
        actualEnd: toISOForDate(scheduleDate, actualEndTime ?? '', timezone),
      });
      if (conflict) {
        setTimeConflictError(true);
        return;
      }

      save({ start_time: isoValue });
    },
    [scheduleDate, endTime, actualStartTime, actualEndTime, save, timezone, checkConflict],
  );

  const handleEndTimeChange = useCallback(
    (time: string) => {
      localDirtyRef.current = true;
      setEndTime(time);

      if (suppressSaveRef.current) return;
      if (!scheduleDate) return;
      const isoValue = toISOForDate(scheduleDate, time, timezone);
      if (!isoValue) return;

      const conflict = checkConflict({
        plannedStart: toISOForDate(scheduleDate, startTime, timezone),
        plannedEnd: isoValue,
        actualStart: toISOForDate(scheduleDate, actualStartTime ?? '', timezone),
        actualEnd: toISOForDate(scheduleDate, actualEndTime ?? '', timezone),
      });
      if (conflict) {
        setTimeConflictError(true);
        return;
      }

      save({ end_time: isoValue });
    },
    [scheduleDate, startTime, actualStartTime, actualEndTime, save, timezone, checkConflict],
  );

  // 記録時間: 即時保存（サーバー側で隣接auto-shrink）。planned と同じく save 直前に同期判定。
  const handleActualStartChange = useCallback(
    (time: string | null) => {
      localDirtyRef.current = true;
      setActualStartTime(time);
      if (!scheduleDate) return;

      const isoValue = toISOForDate(scheduleDate, time ?? '', timezone);
      if (!isoValue) return;

      const conflict = checkConflict({
        plannedStart: toISOForDate(scheduleDate, startTime, timezone),
        plannedEnd: toISOForDate(scheduleDate, endTime, timezone),
        actualStart: isoValue,
        actualEnd: toISOForDate(scheduleDate, actualEndTime ?? '', timezone),
      });
      if (conflict) {
        setTimeConflictError(true);
        return;
      }

      saveImmediate({ actual_start_time: isoValue });
    },
    [scheduleDate, saveImmediate, timezone, startTime, endTime, actualEndTime, checkConflict],
  );

  const handleActualEndChange = useCallback(
    (time: string | null) => {
      localDirtyRef.current = true;
      setActualEndTime(time);
      if (!scheduleDate) return;

      const isoValue = toISOForDate(scheduleDate, time ?? '', timezone);
      if (!isoValue) return;

      if (entry?.origin === 'unplanned' && new Date(isoValue).getTime() > Date.now()) {
        setTimeConflictError(true);
        return;
      }

      const conflict = checkConflict({
        plannedStart: toISOForDate(scheduleDate, startTime, timezone),
        plannedEnd: toISOForDate(scheduleDate, endTime, timezone),
        actualStart: toISOForDate(scheduleDate, actualStartTime ?? '', timezone),
        actualEnd: isoValue,
      });
      if (conflict) {
        setTimeConflictError(true);
        return;
      }

      saveImmediate({ actual_end_time: isoValue });
    },
    [
      entry?.origin,
      scheduleDate,
      saveImmediate,
      timezone,
      startTime,
      endTime,
      actualStartTime,
      checkConflict,
    ],
  );

  // dirty フラグを entry 変更後にクリア（refetch サイクル完了待ち）
  useEffect(() => {
    if (localDirtyRef.current) {
      const timer = setTimeout(() => {
        localDirtyRef.current = false;
      }, 1000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [entry]);

  // ローカル状態のみ更新（保存は呼び出し元で行う）
  const setStartTimeLocal = useCallback((time: string) => {
    localDirtyRef.current = true;
    setStartTime(time);
  }, []);
  const setEndTimeLocal = useCallback((time: string) => {
    localDirtyRef.current = true;
    setEndTime(time);
  }, []);
  const resetActualTimesLocal = useCallback(() => {
    localDirtyRef.current = true;
    setActualStartTime(null);
    setActualEndTime(null);
  }, []);

  // 派生値
  const today = useMemo(() => new Date(), []);

  return {
    timezone,
    timeConflictError,
    titleRef,
    descriptionRef,
    scheduleDate,
    startTime,
    endTime,
    actualStartTime,
    actualEndTime,
    today,
    handleScheduleDateChange,
    handleStartTimeChange,
    handleEndTimeChange,
    handleActualStartChange,
    handleActualEndChange,
    setStartTimeLocal,
    setEndTimeLocal,
    resetActualTimesLocal,
    suppressSaveRef,
  };
}
