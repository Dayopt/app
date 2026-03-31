'use client';

import { useCallback, useMemo, useState } from 'react';

import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { ColonTagLabel } from '@/components/ui/colon-tag-label';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import type { Tag, TagDeleteStrategy } from '../types';
import { TagIcon } from './TagIcon';

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
 * 関連エントリがあるタグを削除する際に、エントリごと削除するか別タグに再割当てするかを選ばせる
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
  const [searchQuery, setSearchQuery] = useState('');

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setStrategy('delete_entries');
      setTargetTagId(null);
      setSearchQuery('');
    }
  }

  const filteredTags = useMemo(() => {
    if (!searchQuery.trim()) {
      return availableTags;
    }

    const query = searchQuery.toLowerCase();
    return availableTags.filter((tag) => tag.name.toLowerCase().includes(query));
  }, [availableTags, searchQuery]);

  const handleConfirm = useCallback(async () => {
    await onConfirm(strategy, targetTagId ?? undefined);
  }, [onConfirm, strategy, targetTagId]);

  const isConfirmDisabled = strategy === 'reassign' && !targetTagId;

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={handleConfirm}
      title={t('delete.confirmTitleWithName', { name: tagName })}
      variant="destructive"
      confirmDisabled={isConfirmDisabled}
    >
      <div className="space-y-4">
        <p className="text-muted-foreground text-sm">
          {t('deleteStrategy.usedByEntries', { count: entryCount })}
        </p>

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
            <p className="text-muted-foreground text-xs font-medium">
              {t('deleteStrategy.selectTarget')}
            </p>

            {availableTags.length > 5 ? (
              <div className="relative">
                <Search className="text-muted-foreground absolute top-1/2 left-4 size-4 -translate-y-1/2" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('deleteStrategy.searchTags')}
                  className="pl-8"
                />
              </div>
            ) : null}

            <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border p-1">
              {filteredTags.map((tag) => {
                const isSelected = targetTagId === tag.id;

                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => setTargetTagId(tag.id)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-lg px-4 py-2 text-sm transition-colors',
                      isSelected
                        ? 'bg-state-selected text-foreground'
                        : 'hover:bg-state-hover text-foreground',
                    )}
                  >
                    <TagIcon icon={tag.icon} color={tag.color} size="sm" className="shrink-0" />
                    <ColonTagLabel name={tag.name} />
                  </button>
                );
              })}
              {filteredTags.length === 0 ? (
                <p className="text-muted-foreground px-4 py-2 text-center text-xs">
                  {t('page.noTags')}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </ConfirmDialog>
  );
}
