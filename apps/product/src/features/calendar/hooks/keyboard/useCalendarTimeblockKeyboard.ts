'use client';

import { useEffect, useRef } from 'react';

import {
  resolveTimeblockDestination,
  useTimeblockInspectorStore,
  useTimeblockWriteMutations,
} from '@/features/timeblock';
import { localTimeToUTCISO } from '@/lib/date/timezone';
import { useUserPreferences } from '@/lib/hooks/useUserPreferences';
import { logger } from '@/lib/logger';
import { toast } from '@/lib/toast';
import { useTranslations } from 'next-intl';
import { useTimeblockClipboardStore } from '../../stores/useTimeblockClipboardStore';
import type { ShortcutDef } from './shortcut-registry';
import { registerShortcuts } from './shortcut-registry';

/** useCalendarEventKeyboard フックのオプション */
interface UseCalendarEventKeyboardOptions {
  /** ショートカットを有効にするか */
  enabled?: boolean;
  /** 現在選択中（Inspector表示中）のエントリーを削除する関数 */
  onDeleteEntry?: (entryId: string) => Promise<void>;
  /** 現在選択中のエントリーのタイトルを取得する関数 */
  getSelectedEntryTitle?: () => string | null;
  /** 新規エントリー作成時の初期データ取得関数（現在の日時など） */
  getInitialEntryData?: () => { start_time?: string; end_time?: string } | undefined;
  /** 現在選択中のエントリーのコピー情報を取得する関数 */
  getSelectedEntryForCopy?: () => {
    title: string;
    description: string | null;
    startHour: number;
    startMinute: number;
    duration: number;
    tagId: string | null | undefined;
  } | null;
  /** ペースト先の日付を取得する関数（デフォルトは現在表示中の日付） */
  getPasteDateForKeyboard?: () => Date;
}

/**
 * カレンダー用エントリー操作キーボードショートカット
 *
 * Google Calendar互換のショートカット：
 * - Delete / Backspace: 選択中エントリーを削除
 * - C: 新規エントリー作成（現在時刻）
 * - Shift + C: 新規エントリー作成（時刻指定なし）
 * - Cmd/Ctrl + C: 選択中のエントリーをコピー
 * - Cmd/Ctrl + V: コピーしたエントリーをペースト（ドラフトモード）
 * - Escape: Inspectorを閉じる
 */
export function useCalendarEventKeyboard({
  enabled = true,
  onDeleteEntry,
  getSelectedEntryTitle,
  getInitialEntryData,
  getSelectedEntryForCopy,
  getPasteDateForKeyboard,
}: UseCalendarEventKeyboardOptions) {
  const t = useTranslations();
  const { isOpen, entryId, openInspector, closeInspector } = useTimeblockInspectorStore();
  const { createLog, createPlan } = useTimeblockWriteMutations();
  // ユーザーの設定タイムゾーン（ペースト時のUTC変換に使用）
  const timezone = useUserPreferences((s: { timezone: string }) => s.timezone);

  // コールバックの最新値を参照
  const onDeleteEntryRef = useRef(onDeleteEntry);
  const getSelectedEntryTitleRef = useRef(getSelectedEntryTitle);
  const getInitialEntryDataRef = useRef(getInitialEntryData);
  const getSelectedEntryForCopyRef = useRef(getSelectedEntryForCopy);
  const getPasteDateForKeyboardRef = useRef(getPasteDateForKeyboard);
  const createPlanRef = useRef(createPlan);
  const createLogRef = useRef(createLog);
  const isOpenRef = useRef(isOpen);
  const entryIdRef = useRef(entryId);
  const closeInspectorRef = useRef(closeInspector);
  const openInspectorRef = useRef(openInspector);
  const tRef = useRef(t);
  const timezoneRef = useRef(timezone);

  useEffect(() => {
    onDeleteEntryRef.current = onDeleteEntry;
    getSelectedEntryTitleRef.current = getSelectedEntryTitle;
    getInitialEntryDataRef.current = getInitialEntryData;
    getSelectedEntryForCopyRef.current = getSelectedEntryForCopy;
    getPasteDateForKeyboardRef.current = getPasteDateForKeyboard;
    createPlanRef.current = createPlan;
    createLogRef.current = createLog;
    isOpenRef.current = isOpen;
    entryIdRef.current = entryId;
    closeInspectorRef.current = closeInspector;
    openInspectorRef.current = openInspector;
    tRef.current = t;
    timezoneRef.current = timezone;
  }, [
    onDeleteEntry,
    getSelectedEntryTitle,
    getInitialEntryData,
    getSelectedEntryForCopy,
    getPasteDateForKeyboard,
    createPlan,
    createLog,
    isOpen,
    entryId,
    closeInspector,
    openInspector,
    t,
    timezone,
  ]);

  useEffect(() => {
    if (!enabled) return;

    /** dialog/inspector内かどうかを判定 */
    const isInDialogOrInspector = (): boolean => {
      const target = document.activeElement;
      if (!target) return false;
      return (
        target.closest('[role="dialog"]') !== null || target.closest('[data-inspector]') !== null
      );
    };

    const shortcuts: ShortcutDef[] = [
      {
        key: 'Escape',
        description: 'Inspectorを閉じる',
        priority: 0,
        handler: (e) => {
          if (isOpenRef.current) {
            e.preventDefault();
            closeInspectorRef.current();
          }
        },
      },
      {
        key: 'Delete',
        description: '選択中エントリーを削除',
        priority: 0,
        handler: (e) => {
          if (isInDialogOrInspector()) return;
          if (isOpenRef.current && entryIdRef.current) {
            e.preventDefault();
            const deleteCallback = onDeleteEntryRef.current;
            if (deleteCallback) {
              void deleteCallback(entryIdRef.current);
              closeInspectorRef.current();
            }
          }
        },
      },
      {
        key: 'Backspace',
        description: '選択中エントリーを削除（Backspace）',
        priority: 0,
        handler: (e) => {
          if (isInDialogOrInspector()) return;
          if (isOpenRef.current && entryIdRef.current) {
            e.preventDefault();
            const deleteCallback = onDeleteEntryRef.current;
            if (deleteCallback) {
              void deleteCallback(entryIdRef.current);
              closeInspectorRef.current();
            }
          }
        },
      },
      {
        key: 'Cmd+C',
        description: '選択中エントリーをコピー',
        priority: 0,
        handler: (e) => {
          if (isInDialogOrInspector()) return;
          if (isOpenRef.current && entryIdRef.current) {
            const entryData = getSelectedEntryForCopyRef.current?.();
            if (entryData) {
              e.preventDefault();
              useTimeblockClipboardStore.getState().copyEntry(entryData);
              toast.success(tRef.current('common.toast.copied'));
            }
          }
        },
      },
      {
        key: 'Cmd+V',
        description: 'コピーしたエントリーをペースト',
        priority: 0,
        handler: (e) => {
          if (isInDialogOrInspector()) return;
          const clipboard = useTimeblockClipboardStore.getState();
          const copiedEntry = clipboard.copiedEntry;
          if (copiedEntry) {
            e.preventDefault();

            const lastClicked = clipboard.lastClickedPosition;
            const targetDate =
              lastClicked?.date ?? getPasteDateForKeyboardRef.current?.() ?? new Date();

            // ユーザーのタイムゾーンを考慮してUTC ISOに変換する
            const tz = timezoneRef.current;
            const startTimeISO = localTimeToUTCISO(
              targetDate,
              copiedEntry.startHour,
              copiedEntry.startMinute,
              tz,
            );
            const endMs = new Date(startTimeISO).getTime() + copiedEntry.duration * 60 * 1000;
            const endTimeISO = new Date(endMs).toISOString();

            // 保存先は end ルールで一意に決める（コピー元の予定/記録の別を引き継がない）
            const destination = resolveTimeblockDestination(endTimeISO);
            const pasteInput = {
              title: copiedEntry.title,
              note: copiedEntry.description ?? undefined,
              tagId: copiedEntry.tagId ?? undefined,
              start_at: startTimeISO,
              end_at: endTimeISO,
            };
            const onPasted = (result: { id: string } | undefined) => {
              if (result?.id) {
                openInspectorRef.current(result.id, destination);
              }
            };
            const onPasteFailed = () => logger.error('Failed to paste entry');
            if (destination === 'plan') {
              createPlanRef.current.mutateAsync(pasteInput).then(onPasted).catch(onPasteFailed);
            } else {
              createLogRef.current.mutateAsync(pasteInput).then(onPasted).catch(onPasteFailed);
            }
          }
        },
      },
      {
        key: 'C',
        description: '新規エントリー作成',
        priority: 0,
        handler: (e) => {
          if (isInDialogOrInspector()) return;
          e.preventDefault();

          // 未来15分の枠を既定にする（quick create は必ず時間範囲を持つ time model の制約に合わせる）
          const now = new Date();
          const roundedStart = new Date(
            Math.ceil(now.getTime() / (15 * 60 * 1000)) * 15 * 60 * 1000,
          );
          const defaultEnd = new Date(roundedStart.getTime() + 15 * 60 * 1000);

          const initialData = e.shiftKey ? undefined : getInitialEntryDataRef.current?.();
          const startAt = initialData?.start_time ?? roundedStart.toISOString();
          const endAt = initialData?.end_time ?? defaultEnd.toISOString();
          const destination = resolveTimeblockDestination(endAt);
          const createInput = {
            title: tRef.current('timeblock.untitled'),
            start_at: startAt,
            end_at: endAt,
          };
          const onCreated = (result: { id: string } | undefined) => {
            if (result?.id) {
              openInspectorRef.current(result.id, destination);
            }
          };
          const onCreateFailed = () => logger.error('Failed to create entry');
          if (destination === 'plan') {
            createPlanRef.current.mutateAsync(createInput).then(onCreated).catch(onCreateFailed);
          } else {
            createLogRef.current.mutateAsync(createInput).then(onCreated).catch(onCreateFailed);
          }
        },
      },
      {
        key: 'Shift+C',
        description: '新規エントリー作成（現在時刻から15分）',
        priority: 0,
        handler: (e) => {
          if (isInDialogOrInspector()) return;
          e.preventDefault();

          const now = new Date();
          const roundedStart = new Date(
            Math.ceil(now.getTime() / (15 * 60 * 1000)) * 15 * 60 * 1000,
          );
          const endAt = new Date(roundedStart.getTime() + 15 * 60 * 1000).toISOString();
          const destination = resolveTimeblockDestination(endAt);
          const createInput = {
            title: tRef.current('timeblock.untitled'),
            start_at: roundedStart.toISOString(),
            end_at: endAt,
          };
          const onCreated = (result: { id: string } | undefined) => {
            if (result?.id) {
              openInspectorRef.current(result.id, destination);
            }
          };
          const onCreateFailed = () => logger.error('Failed to create entry');
          if (destination === 'plan') {
            createPlanRef.current.mutateAsync(createInput).then(onCreated).catch(onCreateFailed);
          } else {
            createLogRef.current.mutateAsync(createInput).then(onCreated).catch(onCreateFailed);
          }
        },
      },
    ];

    return registerShortcuts(shortcuts);
  }, [enabled]);
}
