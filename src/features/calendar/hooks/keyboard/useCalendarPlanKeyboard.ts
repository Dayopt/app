'use client';

import { useEffect, useRef } from 'react';

import { useEntryInspectorStore, useEntryMutations } from '@/features/entry';
import { logger } from '@/lib/logger';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useEntryClipboardStore } from '../../stores/useEntryClipboardStore';
import type { ShortcutDef } from './shortcut-registry';
import { registerShortcuts } from './shortcut-registry';

/** useCalendarEventKeyboard フックのオプション */
interface UseCalendarEventKeyboardOptions {
  /** ショートカットを有効にするか */
  enabled?: boolean;
  /** 現在選択中（Inspector表示中）のプランを削除する関数 */
  onDeletePlan?: (planId: string) => Promise<void>;
  /** 現在選択中のプランのタイトルを取得する関数 */
  getSelectedPlanTitle?: () => string | null;
  /** 新規プラン作成時の初期データ取得関数（現在の日時など） */
  getInitialPlanData?: () => { start_time?: string; end_time?: string } | undefined;
  /** 現在選択中のプランのコピー情報を取得する関数 */
  getSelectedPlanForCopy?: () => {
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
 * カレンダー用プラン操作キーボードショートカット
 *
 * Google Calendar互換のショートカット：
 * - Delete / Backspace: 選択中のプランを削除
 * - C: 新規プラン作成（現在時刻）
 * - Shift + C: 新規プラン作成（時刻指定なし）
 * - Cmd/Ctrl + C: 選択中のプランをコピー
 * - Cmd/Ctrl + V: コピーしたプランをペースト（ドラフトモード）
 * - Escape: Inspectorを閉じる
 */
export function useCalendarEventKeyboard({
  enabled = true,
  onDeletePlan,
  getSelectedPlanTitle,
  getInitialPlanData,
  getSelectedPlanForCopy,
  getPasteDateForKeyboard,
}: UseCalendarEventKeyboardOptions) {
  const t = useTranslations();
  const { isOpen, entryId, openInspector, closeInspector } = useEntryInspectorStore();
  const { createEntry } = useEntryMutations();

  // コールバックの最新値を参照
  const onDeletePlanRef = useRef(onDeletePlan);
  const getSelectedPlanTitleRef = useRef(getSelectedPlanTitle);
  const getInitialPlanDataRef = useRef(getInitialPlanData);
  const getSelectedPlanForCopyRef = useRef(getSelectedPlanForCopy);
  const getPasteDateForKeyboardRef = useRef(getPasteDateForKeyboard);
  const createEntryRef = useRef(createEntry);
  const isOpenRef = useRef(isOpen);
  const entryIdRef = useRef(entryId);
  const closeInspectorRef = useRef(closeInspector);
  const openInspectorRef = useRef(openInspector);
  const tRef = useRef(t);

  useEffect(() => {
    onDeletePlanRef.current = onDeletePlan;
    getSelectedPlanTitleRef.current = getSelectedPlanTitle;
    getInitialPlanDataRef.current = getInitialPlanData;
    getSelectedPlanForCopyRef.current = getSelectedPlanForCopy;
    getPasteDateForKeyboardRef.current = getPasteDateForKeyboard;
    createEntryRef.current = createEntry;
    isOpenRef.current = isOpen;
    entryIdRef.current = entryId;
    closeInspectorRef.current = closeInspector;
    openInspectorRef.current = openInspector;
    tRef.current = t;
  }, [
    onDeletePlan,
    getSelectedPlanTitle,
    getInitialPlanData,
    getSelectedPlanForCopy,
    getPasteDateForKeyboard,
    createEntry,
    isOpen,
    entryId,
    closeInspector,
    openInspector,
    t,
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
        description: '選択中プランを削除',
        priority: 0,
        handler: (e) => {
          if (isInDialogOrInspector()) return;
          if (isOpenRef.current && entryIdRef.current) {
            e.preventDefault();
            const deleteCallback = onDeletePlanRef.current;
            if (deleteCallback) {
              void deleteCallback(entryIdRef.current);
              closeInspectorRef.current();
            }
          }
        },
      },
      {
        key: 'Backspace',
        description: '選択中プランを削除（Backspace）',
        priority: 0,
        handler: (e) => {
          if (isInDialogOrInspector()) return;
          if (isOpenRef.current && entryIdRef.current) {
            e.preventDefault();
            const deleteCallback = onDeletePlanRef.current;
            if (deleteCallback) {
              void deleteCallback(entryIdRef.current);
              closeInspectorRef.current();
            }
          }
        },
      },
      {
        key: 'Cmd+C',
        description: '選択中プランをコピー',
        priority: 0,
        handler: (e) => {
          if (isInDialogOrInspector()) return;
          if (isOpenRef.current && entryIdRef.current) {
            const planData = getSelectedPlanForCopyRef.current?.();
            if (planData) {
              e.preventDefault();
              useEntryClipboardStore.getState().copyEntry(planData);
              toast.success(tRef.current('common.toast.copied'));
            }
          }
        },
      },
      {
        key: 'Cmd+V',
        description: 'コピーしたプランをペースト',
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

            const startTime = new Date(targetDate);
            startTime.setHours(copiedEntry.startHour, copiedEntry.startMinute, 0, 0);

            const endTime = new Date(startTime);
            endTime.setMinutes(endTime.getMinutes() + copiedEntry.duration);

            createEntryRef.current
              .mutateAsync({
                title: copiedEntry.title,
                description: copiedEntry.description ?? undefined,
                start_time: startTime.toISOString(),
                end_time: endTime.toISOString(),
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
        description: '新規プラン作成',
        priority: 0,
        handler: (e) => {
          if (isInDialogOrInspector()) return;
          e.preventDefault();

          const initialData = e.shiftKey ? undefined : getInitialPlanDataRef.current?.();
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
        description: '新規プラン作成（時刻指定なし）',
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
