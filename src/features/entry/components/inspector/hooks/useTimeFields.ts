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

import { localTimeToUTCISO, parseISOToUserTimezone } from '@/lib/date-utils';
import { useCalendarSettingsStore } from '@/lib/stores/useCalendarSettingsStore';
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

function rangesOverlap(
  startA: string | null,
  endA: string | null,
  startB: string | null,
  endB: string | null,
): boolean {
  if (!startA || !endA || !startB || !endB) return false;
  return new Date(startA) < new Date(endB) && new Date(endA) > new Date(startB);
}

/** Inspectorの時間フィールド状態管理フック（scheduleDate/startTime/endTime/actualTime対応）
 * @param options - entry, entryId, save, saveImmediate
 * @returns scheduleDate, startTime, endTime, actualStartTime, actualEndTime および各ハンドラー
 */
export function useTimeFields({ entry, entryId, save, saveImmediate }: UseTimeFieldsOptions) {
  const timezone = useCalendarSettingsStore((state) => state.timezone);
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

  // リアルタイム重複チェック
  useEffect(() => {
    if (!scheduleDate || !entryId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- tRPCキャッシュ参照を伴う重複チェック結果の反映
      setTimeConflictError(false);
      return;
    }

    const plannedStartISO = toISOForDate(scheduleDate, startTime, timezone);
    const plannedEndISO = toISOForDate(scheduleDate, endTime, timezone);
    const actualStartISO = toISOForDate(scheduleDate, actualStartTime ?? '', timezone);
    const actualEndISO = toISOForDate(scheduleDate, actualEndTime ?? '', timezone);

    if ((!plannedStartISO || !plannedEndISO) && (!actualStartISO || !actualEndISO)) {
      setTimeConflictError(false);
      return;
    }

    if (
      entry?.origin === 'unplanned' &&
      actualEndISO &&
      new Date(actualEndISO).getTime() > Date.now()
    ) {
      setTimeConflictError(true);
      return;
    }

    // calendar は date-filtered key (`entries.list({ startDate, endDate })`) を使うため、
    // input なしの `getData()` では永遠に undefined。全 entries.list cache を予測子で集める。
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
      origin: string | null;
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

    if (collected.length === 0) {
      setTimeConflictError(false);
      return;
    }

    const hasOverlap = collected.some((e) => {
      if (e.id === entryId) return false;
      if (
        entry?.origin === 'planned' &&
        rangesOverlap(plannedStartISO, plannedEndISO, e.start_time, e.end_time)
      ) {
        return true;
      }
      return rangesOverlap(actualStartISO, actualEndISO, e.actual_start_time, e.actual_end_time);
    });

    setTimeConflictError(hasOverlap);
  }, [
    scheduleDate,
    startTime,
    endTime,
    actualStartTime,
    actualEndTime,
    entryId,
    entry?.origin,
    timezone,
    queryClient,
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
          save({
            actual_start_time: actualStartISO,
            actual_end_time: actualEndISO,
          });
        }
        return;
      }

      if (startTime && endTime) {
        save({
          start_time: toISOForDate(date, startTime, timezone),
          end_time: toISOForDate(date, endTime, timezone),
        });
      } else if (startTime) {
        save({ start_time: toISOForDate(date, startTime, timezone) });
      } else if (endTime) {
        save({ end_time: toISOForDate(date, endTime, timezone) });
      }
    },
    [entry?.origin, actualStartTime, actualEndTime, startTime, endTime, save, timezone],
  );

  const handleStartTimeChange = useCallback(
    (time: string) => {
      localDirtyRef.current = true;
      setStartTime(time);

      if (suppressSaveRef.current) return;
      const isoValue = scheduleDate ? toISOForDate(scheduleDate, time, timezone) : null;

      if (isoValue && !timeConflictError) {
        save({ start_time: isoValue });
      }
    },
    [scheduleDate, save, timezone, timeConflictError],
  );

  const handleEndTimeChange = useCallback(
    (time: string) => {
      localDirtyRef.current = true;
      setEndTime(time);

      if (suppressSaveRef.current) return;
      const isoValue = scheduleDate ? toISOForDate(scheduleDate, time, timezone) : null;

      if (isoValue && !timeConflictError) {
        save({ end_time: isoValue });
      }
    },
    [scheduleDate, save, timezone, timeConflictError],
  );

  // 記録時間: 即時保存（サーバー側で隣接auto-shrink）
  const handleActualStartChange = useCallback(
    (time: string | null) => {
      localDirtyRef.current = true;
      setActualStartTime(time);
      if (!scheduleDate) return;

      const isoValue = toISOForDate(scheduleDate, time ?? '', timezone);
      if (!isoValue) return;

      saveImmediate({ actual_start_time: isoValue });
    },
    [scheduleDate, saveImmediate, timezone],
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

      saveImmediate({ actual_end_time: isoValue });
    },
    [entry?.origin, scheduleDate, saveImmediate, timezone],
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
