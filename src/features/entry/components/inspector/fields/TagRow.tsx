'use client';

/**
 * タグ表示行
 *
 * カラードット + タグ名を表示し、クリックで TagQuickSelector を開く。
 * タグ未設定時は「タグを追加」を表示。
 * 右側に ⋯ メニューを配置。
 */

import { useCallback, useRef, useState } from 'react';

import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { TagQuickSelector, useCreateTag, useTagsMap } from '@/features/tags';
import { getTagColorClasses, resolveTagColor } from '@/lib/tag-colors';
import { cn } from '@/lib/utils';

interface TagRowProps {
  tagId: string | null;
  onTagChange: (tagId: string | null) => void;
  /** 削除ボタンのコールバック */
  onDelete?: (() => void) | undefined;
}

export function TagRow({ tagId, onTagChange, onDelete }: TagRowProps) {
  const t = useTranslations();
  const { getTagById } = useTagsMap();
  const [selectorOpen, setSelectorOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const createTagMutation = useCreateTag({ showToast: false });

  const tag = tagId ? getTagById(tagId) : undefined;
  const colorClasses = tag ? getTagColorClasses(tag.color) : null;

  const handleSelect = useCallback(
    (selectedTagId: string) => {
      onTagChange(selectedTagId);
      setSelectorOpen(false);
    },
    [onTagChange],
  );

  const handleCreateAndSelect = useCallback(
    async (name: string, color?: string | null) => {
      try {
        const newTag = await createTagMutation.mutateAsync({
          name,
          color: resolveTagColor(color),
        });
        onTagChange(newTag.id);
        setSelectorOpen(false);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('duplicate') || message.includes('already exists')) {
          toast.error(t('tags.errors.duplicateName'));
        } else {
          toast.error(t('tags.errors.createFailed'));
        }
      }
    },
    [createTagMutation, onTagChange, t],
  );

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setSelectorOpen(true)}
          className="hover:bg-state-hover -mt-1 -ml-1.5 flex items-center gap-2 rounded-lg py-1 pr-2 pl-1.5 text-base font-semibold transition-colors"
          aria-label={tag ? `${t('common.tags.change')}: ${tag.name}` : t('common.tags.add')}
        >
          {tag ? (
            <>
              <span
                className={cn(
                  'inline-block size-2.5 flex-shrink-0 rounded-full',
                  colorClasses?.dot ?? 'bg-muted-foreground',
                )}
                aria-hidden
              />
              <span className="text-foreground">{tag.name}</span>
              <ChevronDown className="text-muted-foreground size-4 flex-shrink-0" aria-hidden />
            </>
          ) : (
            <>
              <Plus className="text-muted-foreground size-3.5 flex-shrink-0" aria-hidden />
              <span className="text-muted-foreground">{t('common.tags.add')}</span>
              <ChevronDown className="text-muted-foreground size-4 flex-shrink-0" aria-hidden />
            </>
          )}
        </button>

        {/* 右側: 削除 */}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="text-muted-foreground hover:bg-state-hover -mr-2 flex size-8 items-center justify-center rounded-lg transition-colors"
            aria-label={t('common.actions.delete')}
          >
            <Trash2 className="size-4" />
          </button>
        )}
      </div>

      <TagQuickSelector
        open={selectorOpen}
        onOpenChange={setSelectorOpen}
        onSelect={handleSelect}
        onCreateAndSelect={handleCreateAndSelect}
        anchorRef={buttonRef}
      />
    </>
  );
}
