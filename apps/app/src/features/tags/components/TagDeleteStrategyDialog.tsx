'use client';

import { useCallback, useState } from 'react';

import { useTranslations } from 'next-intl';

import { DestructiveFormDialog } from '@/lib/components/ui/destructive-form-dialog';
import { RadioGroup, RadioGroupItem } from '@/lib/components/ui/radio-group';

import type { Tag, TagDeleteStrategy } from '../types';
import { TagBadgeList } from './TagBadgeList';

interface TagDeleteStrategyDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (strategy: TagDeleteStrategy, targetTagId?: string) => Promise<void>;
  tagName: string;
  entryCount: number;
  availableTags: Tag[];
}

/**
 * タグ削除戦略選択ダイアログ
 *
 * 関連エントリがあるタグを削除する際に、エントリごと削除するか別タグに再割当てするかを選ばせる。
 */
export function TagDeleteStrategyDialog({
  open,
  onClose,
  onConfirm,
  tagName,
  entryCount,
  availableTags,
}: TagDeleteStrategyDialogProps) {
  const t = useTranslations('tags');

  const [strategy, setStrategy] = useState<TagDeleteStrategy>('delete_entries');
  const [targetTagId, setTargetTagId] = useState<string | null>(null);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setStrategy('delete_entries');
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
      description={t('deleteStrategy.usedByEntries', { count: entryCount })}
      confirmDisabled={isConfirmDisabled}
    >
      <div className="space-y-4">
        <RadioGroup
          value={strategy}
          onValueChange={(value) => setStrategy(value as TagDeleteStrategy)}
          className="space-y-2"
        >
          <label htmlFor="strategy-delete" className="flex cursor-pointer items-center gap-4">
            <RadioGroupItem value="delete_entries" id="strategy-delete" />
            <span className="text-sm">{t('deleteStrategy.deleteEntries')}</span>
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
