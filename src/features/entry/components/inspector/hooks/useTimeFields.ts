'use client';

/**
 * 時間フィールドの状態管理
 *
 * scheduleDate, startTime, endTime, actualStartTime, actualEndTime,
 * reminderMinutes の local state と変更ハンドラーを提供。
 *
 * 保存は useDebouncedSave に委譲。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useCalendarSettingsStore } from '@/features/calendar';
import { localTimeToUTCISO, parseISOToUserTimezone } from '@/lib/date-utils';
import { api } from '@/lib/trpc';
import type { EntryWithTags } from '../../../types/entry';

interface UseTimeFieldsOptions {
  entry: EntryWithTags | null;
  entryId: string | null;
  /** useDebouncedSave.save — デバウンス保存 */
  save: (fields: Record<string, string | number | null | undefined>) => void;
  /** useDebouncedSave.saveImmediate — 即時保存 */
  saveImmediate: (fields: Record<string, string | number | null | undefined>) => void;
}

/** HH:MM 形式の時間文字列を生成 */
function toHHMM(date: Date): string {
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

/** Inspectorの時間・リマインダーフィールド状態管理フック（scheduleDate/startTime/endTime/actualTime対応）
 * @param options - entry, entryId, save, saveImmediate
 * @returns scheduleDate, startTime, endTime, actualStartTime, actualEndTime, reminderMinutes および各ハンドラー
 */
export function useTimeFields({ entry, entryId, save, saveImmediate }: UseTimeFieldsOptions) {
  const timezone = useCalendarSettingsStore((state) => state.timezone);
  const utils = api.useUtils();

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
  const [reminderMinutes, setReminderMinutes] = useState<number | null>(null);
  const [actualStartTime, setActualStartTime] = useState<string | null>(null);
  const [actualEndTime, setActualEndTime] = useState<string | null>(null);

  // entry データからローカル state を初期化
  useEffect(() => {
    if (localDirtyRef.current) return; // ユーザーの未保存変更を保護
    if (entry && 'id' in entry) {
      if (entry.start_time) {
        const date = parseISOToUserTimezone(entry.start_time, timezone);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- entryデータからのタイムゾーン変換結果を同期
        setScheduleDate(date);
        setStartTime(toHHMM(date));
      } else {
        setScheduleDate(undefined);
        setStartTime('');
      }

      if (entry.end_time) {
        const date = parseISOToUserTimezone(entry.end_time, timezone);
        setEndTime(toHHMM(date));
      } else {
        setEndTime('');
      }

      setReminderMinutes(entry.reminder_minutes ?? null);

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
      setReminderMinutes(null);
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
    if (!scheduleDate || !startTime || !endTime || !entryId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- tRPCキャッシュ参照を伴う重複チェック結果の反映
      setTimeConflictError(false);
      return;
    }

    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    const startISO = localTimeToUTCISO(scheduleDate, startH ?? 0, startM ?? 0, timezone);
    const endISO = localTimeToUTCISO(scheduleDate, endH ?? 0, endM ?? 0, timezone);

    const entries = utils.entries.list.getData();
    if (!entries) {
      setTimeConflictError(false);
      return;
    }

    const hasOverlap = entries.some(
      (e: { id: string; start_time: string | null; end_time: string | null }) => {
        if (e.id === entryId) return false;
        if (!e.start_time || !e.end_time) return false;
        return (
          new Date(e.start_time) < new Date(endISO) && new Date(e.end_time) > new Date(startISO)
        );
      },
    );

    setTimeConflictError(hasOverlap);
  }, [scheduleDate, startTime, endTime, entryId, timezone, utils.entries.list]);

  // --- ハンドラー ---

  const handleScheduleDateChange = useCallback(
    (date: Date | undefined) => {
      setScheduleDate(date);

      if (date && startTime && endTime) {
        const [startHours, startMinutes] = startTime.split(':').map(Number);
        const [endHours, endMinutes] = endTime.split(':').map(Number);
        save({
          start_time: localTimeToUTCISO(date, startHours ?? 0, startMinutes ?? 0, timezone),
          end_time: localTimeToUTCISO(date, endHours ?? 0, endMinutes ?? 0, timezone),
        });
      } else if (date && startTime) {
        const [hours, minutes] = startTime.split(':').map(Number);
        save({ start_time: localTimeToUTCISO(date, hours ?? 0, minutes ?? 0, timezone) });
      } else if (date && endTime) {
        const [hours, minutes] = endTime.split(':').map(Number);
        save({ end_time: localTimeToUTCISO(date, hours ?? 0, minutes ?? 0, timezone) });
      }
    },
    [startTime, endTime, save, timezone],
  );

  const handleStartTimeChange = useCallback(
    (time: string) => {
      const [hours, minutes] = time ? time.split(':').map(Number) : [0, 0];
      localDirtyRef.current = true;
      setStartTime(time);

      if (suppressSaveRef.current) return;
      const isoValue =
        time && scheduleDate
          ? localTimeToUTCISO(scheduleDate, hours ?? 0, minutes ?? 0, timezone)
          : null;

      if (isoValue && !timeConflictError) {
        save({ start_time: isoValue });
      }
    },
    [scheduleDate, save, timezone, timeConflictError],
  );

  const handleEndTimeChange = useCallback(
    (time: string) => {
      const [hours, minutes] = time ? time.split(':').map(Number) : [0, 0];
      localDirtyRef.current = true;
      setEndTime(time);

      if (suppressSaveRef.current) return;
      const isoValue =
        time && scheduleDate
          ? localTimeToUTCISO(scheduleDate, hours ?? 0, minutes ?? 0, timezone)
          : null;

      if (isoValue && !timeConflictError) {
        save({ end_time: isoValue });
      }
    },
    [scheduleDate, save, timezone, timeConflictError],
  );

  // リマインダー: 即時保存
  const handleReminderChange = useCallback(
    (minutes: number | null) => {
      setReminderMinutes(minutes);
      saveImmediate({ reminder_minutes: minutes });
    },
    [saveImmediate],
  );

  // 記録時間: 即時保存（サーバー側で隣接auto-shrink）
  const handleActualStartChange = useCallback(
    (time: string | null) => {
      setActualStartTime(time);
      if (!scheduleDate) return;

      const isoValue = time
        ? localTimeToUTCISO(
            scheduleDate,
            ...(time.split(':').map(Number) as [number, number]),
            timezone,
          )
        : null;

      saveImmediate({ actual_start_time: isoValue });
    },
    [scheduleDate, saveImmediate, timezone],
  );

  const handleActualEndChange = useCallback(
    (time: string | null) => {
      setActualEndTime(time);
      if (!scheduleDate) return;

      const isoValue = time
        ? localTimeToUTCISO(
            scheduleDate,
            ...(time.split(':').map(Number) as [number, number]),
            timezone,
          )
        : null;

      saveImmediate({ actual_end_time: isoValue });
    },
    [scheduleDate, saveImmediate, timezone],
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
    reminderMinutes,
    actualStartTime,
    actualEndTime,
    today,
    handleScheduleDateChange,
    handleStartTimeChange,
    handleEndTimeChange,
    handleReminderChange,
    handleActualStartChange,
    handleActualEndChange,
    setStartTimeLocal,
    setEndTimeLocal,
    resetActualTimesLocal,
    suppressSaveRef,
  };
}
