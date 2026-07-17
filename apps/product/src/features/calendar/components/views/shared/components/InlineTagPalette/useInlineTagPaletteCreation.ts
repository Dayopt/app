'use client';

/**
 * インラインタグパレットの entry 作成ロジック
 *
 * ドラッグ選択（pendingSelection）からの plan / record 作成、
 * 新規タグ作成 → entry 作成、選択範囲の live 競合判定を担う。
 */

import { useCallback, useMemo, useRef, useState } from 'react';

import { toast } from '@/lib/toast';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import type { HoveredTagInfo } from '@/features/tags';
import { resolveTagColor, useCreateTag } from '@/features/tags';
import {
  collectTimeblockLaneItems,
  hasTimeblockLaneConflict,
  resolveTimeblockDestination,
  useTimeblockWriteMutations,
} from '@/features/timeblock';
import { convertFromTimezone } from '@/lib/date/timezone';
import { useUserPreferences } from '@/lib/hooks/useUserPreferences';
import { logger } from '@/lib/logger';

import { useInlineCreateStore } from '../../../../../stores/useInlineCreateStore';

export function useInlineTagPaletteCreation() {
  const pendingSelection = useInlineCreateStore.use.pendingSelection();
  const clearPendingSelection = useInlineCreateStore.use.clearPendingSelection();
  const timezone = useUserPreferences((s) => s.timezone);
  const t = useTranslations('tags');
  const tEntry = useTranslations('timeblock');

  const queryClient = useQueryClient();
  const { createRecord, createPlan } = useTimeblockWriteMutations();
  const createTagMutation = useCreateTag({ showToast: false });
  const [isCreating, setIsCreating] = useState(false);
  const [hoveredTag, setHoveredTag] = useState<HoveredTagInfo | null>(null);
  const lockedRef = useRef(false);

  // 選択後はホバークリアを無視（mouseLeaveでちらつかないように）
  const handleTagHover = useCallback((tag: HoveredTagInfo | null) => {
    if (tag === null && lockedRef.current) return;
    setHoveredTag(tag);
  }, []);

  // plan / record 作成ハンドラー（タグ必須、タグ名をタイトルに設定）
  const handleCreate = useCallback(
    (tagId: string, tagName: string) => {
      if (!pendingSelection || isCreating) return;

      const { date: selDate, startHour, startMinute, endHour, endMinute } = pendingSelection;

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

      // 保存先は end ルールで一意に決める（lane はドラッグ起点の表示ヒントに留める）
      const destination = resolveTimeblockDestination(utcEnd);

      // 事前 overlap 判定（TagSelector を開いている間の resize / 他クライアント更新による race を回避）
      // 同一レーンのみ禁止（plan×plan / record×record）。plan×record は許可。
      const laneItems = collectTimeblockLaneItems(
        queryClient,
        destination === 'plan' ? 'plans' : 'records',
      );
      if (hasTimeblockLaneConflict(laneItems, utcStart, utcEnd)) {
        toast.error(tEntry('errors.timeOverlap'));
        clearPendingSelection();
        return;
      }

      lockedRef.current = true;
      setIsCreating(true);

      logger.log('🏷️ InlineTagPalette: Creating', {
        destination,
        start: utcStart.toISOString(),
        end: utcEnd.toISOString(),
        tagId,
        title: tagName,
      });

      // ハイライトを即座に消す（pendingSelectionの値は既にローカル変数に展開済み）
      clearPendingSelection();

      const mutation = destination === 'plan' ? createPlan : createRecord;
      mutation.mutate(
        {
          title: tagName,
          start_at: utcStart.toISOString(),
          end_at: utcEnd.toISOString(),
          tagId,
        },
        {
          onSuccess: () => {
            setIsCreating(false);
            toast.success(
              destination === 'plan'
                ? tEntry('editor.toast.planCreated')
                : tEntry('editor.toast.recorded'),
            );
          },
          onError: () => setIsCreating(false),
        },
      );
    },
    [
      pendingSelection,
      isCreating,
      timezone,
      createPlan,
      createRecord,
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

  // 現在の selection が他 entry と重なるかを live 判定（resize や外部更新に追随）。
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

    // 保存先レーンと同じレーンのみ判定（plan×record は共存可）
    const destination = resolveTimeblockDestination(utcEnd);
    const laneItems = collectTimeblockLaneItems(
      queryClient,
      destination === 'plan' ? 'plans' : 'records',
    );
    return hasTimeblockLaneConflict(laneItems, utcStart, utcEnd);
  }, [queryClient, pendingSelection, timezone]);

  return {
    isCreating,
    hoveredTag,
    handleTagHover,
    handleCreate,
    handleCreateAndSelect,
    hasConflict,
  };
}
