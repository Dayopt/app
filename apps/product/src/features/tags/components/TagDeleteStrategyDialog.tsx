'use client';

import { useCallback, useState } from 'react';

import { useTranslations } from 'next-intl';

import { DestructiveFormDialog } from '@/components/ui/overlays/destructive-form-dialog';
import { RadioGroup, RadioGroupItem } from '@dayopt/components';

import type { Tag, TagDeleteStrategy } from '../types';
import { TagBadgeList } from './TagBadgeList';

interface TagDeleteStrategyDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (strategy: TagDeleteStrategy, targetTagId?: string) => Promise<void>;
  tagName: string;
  recordCount: number;
  availableTags: Tag[];
}

/**
 * タグ削除戦略選択ダイアログ
 *
 * 関連 Timeblock があるタグを削除する際に、Timeblock ごと削除するか別タグへ再割当てするかを選ばせる。
 */
export function TagDeleteStrategyDialog({
  open,
  onClose,
  onConfirm,
  tagName,
  recordCount,
  availableTags,
}: TagDeleteStrategyDialogProps) {
  const t = useTranslations('tags');

  const [strategy, setStrategy] = useState<TagDeleteStrategy>('delete_blocks');
  const [targetTagId, setTargetTagId] = useState<string | null>(null);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setStrategy('delete_blocks');
      setTargetTagId(null);
    }
  }

  const handleConfirm = useCallback(async () => {
    await onConfirm(strategy, targetTagId ?? undefined);
  }, [onConfirm, strategy, targetTagId]);

  const isConfirmDisabled = strategy === 'reassign' && !targetTagId;

  return (
    <DestructiveFormDialog
      open={open}
      onClose={onClose}
      onConfirm={handleConfirm}
      title={t('delete.confirmTitleWithName', { name: tagName })}
      description={t('deleteStrategy.usedByTimeblocks', { count: recordCount })}
      confirmDisabled={isConfirmDisabled}
    >
      <div className="space-y-4">
        <RadioGroup
          value={strategy}
          onValueChange={(value) => setStrategy(value as TagDeleteStrategy)}
          className="space-y-2"
        >
          <label htmlFor="strategy-delete" className="flex cursor-pointer items-center gap-4">
            <RadioGroupItem value="delete_blocks" id="strategy-delete" />
            <span className="text-sm">{t('deleteStrategy.deleteTimeblocks')}</span>
          </label>
          <label htmlFor="strategy-reassign" className="flex cursor-pointer items-center gap-4">
            <RadioGroupItem value="reassign" id="strategy-reassign" />
            <span className="text-sm">{t('deleteStrategy.reassign')}</span>
          </label>
        </RadioGroup>

        {strategy === 'reassign' ? (
          <div className="space-y-2">
            <p className="text-muted-foreground px-4 text-xs">{t('deleteStrategy.selectTarget')}</p>
            <div className="max-h-48 overflow-y-auto">
              <TagBadgeList
                tags={availableTags}
                selectedId={targetTagId}
                onSelect={(id) => setTargetTagId(id)}
                supportDrilldown={false}
                asRadioGroup
                ariaLabel={t('deleteStrategy.selectTarget')}
              />
            </div>
          </div>
        ) : null}
      </div>
    </DestructiveFormDialog>
  );
}
