'use client';

import { useEffect, useRef } from 'react';

import { useEntryInspectorStore, useEntryMutations } from '@/features/entry';
import { logger } from '@/lib/logger';
import { openDeleteConfirm } from '@/shell/stores/useModalStore';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useEntryClipboardStore } from '../stores/useEntryClipboardStore';

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
 *
 * @example
 * ```tsx
 * const { deletePlan } = usePlanMutations()
 *
 * useCalendarEventKeyboard({
 *   enabled: true,
 *   onDeletePlan: (planId) => deletePlan.mutate({ id: planId }),
 *   getInitialPlanData: () => ({
 *     start_time: new Date().toISOString(),
 *     end_time: addHours(new Date(), 1).toISOString(),
 *   }),
 * })
 * ```
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
  useEffect(() => {
    onDeletePlanRef.current = onDeletePlan;
    getSelectedPlanTitleRef.current = getSelectedPlanTitle;
    getInitialPlanDataRef.current = getInitialPlanData;
    getSelectedPlanForCopyRef.current = getSelectedPlanForCopy;
    getPasteDateForKeyboardRef.current = getPasteDateForKeyboard;
    createEntryRef.current = createEntry;
  }, [
    onDeletePlan,
    getSelectedPlanTitle,
    getInitialPlanData,
    getSelectedPlanForCopy,
    getPasteDateForKeyboard,
    createEntry,
  ]);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // 入力フィールドにフォーカスがある場合はショートカットを無効化
      const target = e.target as HTMLElement;
      const isInputFocused =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        target.closest('[role="dialog"]') !== null ||
        target.closest('[data-inspector]') !== null;

      // Escapeキー: Inspectorを閉じる（入力フィールドでも有効）
      if (e.key === 'Escape') {
        if (isOpen) {
          e.preventDefault();
          closeInspector();
        }
        return;
      }

      // 入力フィールドにフォーカスがある場合は以降のショートカットを無効化
      if (isInputFocused) return;

      // Delete / Backspace: 選択中のプランの削除確認ダイアログを表示
      if ((e.key === 'Delete' || e.key === 'Backspace') && isOpen && entryId) {
        e.preventDefault();
        const title = getSelectedPlanTitleRef.current?.() ?? null;
        const deleteCallback = onDeletePlanRef.current;
        if (deleteCallback) {
          openDeleteConfirm(entryId, title, async () => {
            await deleteCallback(entryId);
            closeInspector();
          });
        }
        return;
      }

      // Cmd/Ctrl + C: コピー
      if ((e.key === 'c' || e.key === 'C') && (e.metaKey || e.ctrlKey)) {
        // Inspectorで選択中のプランがある場合のみコピー
        if (isOpen && entryId) {
          const planData = getSelectedPlanForCopyRef.current?.();
          if (planData) {
            e.preventDefault();
            useEntryClipboardStore.getState().copyEntry(planData);
            toast.success(t('common.toast.copied'));
          }
        }
        return;
      }

      // Cmd/Ctrl + V: ペースト（Googleカレンダー互換: 最後にクリックした日付へ、時刻はコピー元）
      if ((e.key === 'v' || e.key === 'V') && (e.metaKey || e.ctrlKey)) {
        const clipboard = useEntryClipboardStore.getState();
        const copiedEntry = clipboard.copiedEntry;
        if (copiedEntry) {
          e.preventDefault();

          // 最後にクリックした日付があればその日付へ、なければデフォルト
          const lastClicked = clipboard.lastClickedPosition;
          const targetDate =
            lastClicked?.date ?? getPasteDateForKeyboardRef.current?.() ?? new Date();

          // 時刻は常にコピー元の時刻を使用
          const startTime = new Date(targetDate);
          startTime.setHours(copiedEntry.startHour, copiedEntry.startMinute, 0, 0);

          const endTime = new Date(startTime);
          endTime.setMinutes(endTime.getMinutes() + copiedEntry.duration);

          // 即DB作成 → Inspector edit mode で開く
          createEntryRef.current
            .mutateAsync({
              title: copiedEntry.title,
              description: copiedEntry.description ?? undefined,
              start_time: startTime.toISOString(),
              end_time: endTime.toISOString(),
            })
            .then((result) => {
              if (result?.id) {
                openInspector(result.id);
              }
            })
            .catch(() => {
              logger.error('Failed to paste entry');
            });
        }
        return;
      }

      // C: 新規プラン作成（単独のCキー）
      if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();

        // 即DB作成 → Inspector edit mode で開く
        const initialData = e.shiftKey ? undefined : getInitialPlanDataRef.current?.();
        createEntryRef.current
          .mutateAsync({
            title: '',
            start_time: initialData?.start_time,
            end_time: initialData?.end_time,
          })
          .then((result) => {
            if (result?.id) {
              openInspector(result.id);
            }
          })
          .catch(() => {
            logger.error('Failed to create entry');
          });
        return;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, isOpen, entryId, openInspector, closeInspector, t]);
}
