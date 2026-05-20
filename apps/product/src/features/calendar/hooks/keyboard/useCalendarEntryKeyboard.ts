'use client';

import { useEffect, useRef } from 'react';

import { useEntryInspectorStore, useEntryMutations } from '@/features/entry';
import { localTimeToUTCISO } from '@/lib/date/timezone';
import { logger } from '@/lib/logger';
import { useUserPreferenceStore } from '@/lib/stores/useUserPreferenceStore';
import { toast } from '@/lib/toast';
import { useTranslations } from 'next-intl';
import { useEntryClipboardStore } from '../../stores/useEntryClipboardStore';
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
  const { isOpen, entryId, openInspector, closeInspector } = useEntryInspectorStore();
  const { createEntry } = useEntryMutations();
  // ユーザーの設定タイムゾーン（ペースト時のUTC変換に使用）
  const timezone = useUserPreferenceStore((s: { timezone: string }) => s.timezone);

  // コールバックの最新値を参照
  const onDeleteEntryRef = useRef(onDeleteEntry);
  const getSelectedEntryTitleRef = useRef(getSelectedEntryTitle);
  const getInitialEntryDataRef = useRef(getInitialEntryData);
  const getSelectedEntryForCopyRef = useRef(getSelectedEntryForCopy);
  const getPasteDateForKeyboardRef = useRef(getPasteDateForKeyboard);
  const createEntryRef = useRef(createEntry);
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
    createEntryRef.current = createEntry;
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
    createEntry,
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
              useEntryClipboardStore.getState().copyEntry(entryData);
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
          const clipboard = useEntryClipboardStore.getState();
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

            createEntryRef.current
              .mutateAsync({
                title: copiedEntry.title,
                description: copiedEntry.description ?? undefined,
                start_time: startTimeISO,
                end_time: endTimeISO,
              })
              .then((result) => {
                if (result?.id) {
                  openInspectorRef.current(result.id);
                }
              })
              .catch(() => {
                logger.error('Failed to paste entry');
              });
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

          const initialData = e.shiftKey ? undefined : getInitialEntryDataRef.current?.();
          createEntryRef.current
            .mutateAsync({
              title: '',
              start_time: initialData?.start_time,
              end_time: initialData?.end_time,
            })
            .then((result) => {
              if (result?.id) {
                openInspectorRef.current(result.id);
              }
            })
            .catch(() => {
              logger.error('Failed to create entry');
            });
        },
      },
      {
        key: 'Shift+C',
        description: '新規エントリー作成（時刻指定なし）',
        priority: 0,
        handler: (e) => {
          if (isInDialogOrInspector()) return;
          e.preventDefault();

          createEntryRef.current
            .mutateAsync({
              title: '',
            })
            .then((result) => {
              if (result?.id) {
                openInspectorRef.current(result.id);
              }
            })
            .catch(() => {
              logger.error('Failed to create entry');
            });
        },
      },
    ];

    return registerShortcuts(shortcuts);
  }, [enabled]);
}
