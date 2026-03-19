'use client';

import { useCallback } from 'react';

import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { useEntryCreate } from '@/features/entry';
import {
  CreateActionSheet,
  useCreateActionSheet,
  type CreateActionType,
} from './CreateActionSheet';

/**
 * モバイル用FAB（Floating Action Button）+ CreateActionSheet
 *
 * エントリ作成のトリガー。iOS Safe Area対応済み。
 * useEntryCreate で空きスロット検索 → 作成 → Inspector を一貫して実行。
 */
export function MobileFAB() {
  const t = useTranslations();
  const createActionSheet = useCreateActionSheet();
  const { create } = useEntryCreate();

  const handleCreateAction = useCallback(
    async (_type: CreateActionType) => {
      await create();
    },
    [create],
  );

  return (
    <>
      <Button
        icon
        aria-label={t('common.createNewEvent')}
        className="surface-raised fixed right-4 z-50 size-14 rounded-2xl"
        style={{
          // iOS Safe Area対応: 余白(16px) + Safe Area
          bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
        }}
        onClick={createActionSheet.open}
      >
        <Plus className="size-6" />
      </Button>
      <CreateActionSheet
        open={createActionSheet.isOpen}
        onOpenChange={createActionSheet.setIsOpen}
        onSelect={handleCreateAction}
      />
    </>
  );
}
