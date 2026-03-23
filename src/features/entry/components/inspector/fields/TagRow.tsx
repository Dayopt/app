'use client';

/**
 * タグ表示行（Pure props）
 *
 * カラードット + タグ名を表示し、クリックで TagQuickSelector を開く。
 * タグ未設定時は「タグを追加」を表示。
 * 右側にパレット登録ボタン + 削除ボタンを配置。
 *
 * タグデータの解決とタグ作成は上位（EntryInspectorForm）が担当。
 */

import { useCallback, useRef, useState } from 'react';

import { ChevronDown, Plus, Star, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { HoverTooltip } from '@/components/ui/tooltip';
import { TagQuickSelector } from '@/features/tags';
import type { TagColorEntry } from '@/lib/tag-colors';
import { cn } from '@/lib/utils';

interface TagRowProps {
  tagId: string | null;
  /** 解決済みのタグ名（tagId が null なら undefined） */
  tagName?: string | undefined;
  /** 解決済みのタグ色クラス（tagId が null なら undefined） */
  tagColorClasses?: TagColorEntry | undefined;
  onTagChange: (tagId: string | null) => void;
  /** タグ作成コールバック（上位で useCreateTag を呼ぶ） */
  onCreateAndSelect: (name: string, color?: string | null) => void;
  /** パレットに登録するコールバック（タグ+時間が有効な場合のみ表示） */
  onPinToPalette?: (() => void) | undefined;
  /** パレット登録済みかどうか */
  isPinnedInPalette?: boolean | undefined;
  /** 削除ボタンのコールバック */
  onDelete?: (() => void) | undefined;
}

/** Inspectorのタグ選択行（カラードット + タグ名、クリックでQuickSelector表示） */
export function TagRow({
  tagId,
  tagName,
  tagColorClasses: colorClasses,
  onTagChange,
  onCreateAndSelect,
  onPinToPalette,
  isPinnedInPalette,
  onDelete,
}: TagRowProps) {
  const t = useTranslations();
  const [selectorOpen, setSelectorOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const hasTag = tagId != null && tagName != null;

  const handleSelect = useCallback(
    (selectedTagId: string) => {
      onTagChange(selectedTagId);
      setSelectorOpen(false);
    },
    [onTagChange],
  );

  const handleCreateAndSelect = useCallback(
    async (name: string, color?: string | null) => {
      await onCreateAndSelect(name, color);
      setSelectorOpen(false);
    },
    [onCreateAndSelect],
  );

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setSelectorOpen(true)}
          className="hover:bg-state-hover -mt-1 -ml-1.5 flex items-center gap-2 rounded-lg py-1 pr-2 pl-1.5 text-base font-semibold transition-colors"
          aria-label={hasTag ? `${t('common.tags.change')}: ${tagName}` : t('common.tags.add')}
        >
          {hasTag ? (
            <>
              <span
                className={cn(
                  'inline-block size-2.5 flex-shrink-0 rounded-full',
                  colorClasses?.dot ?? 'bg-muted-foreground',
                )}
                aria-hidden
              />
              <span className="text-foreground">{tagName}</span>
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

        {/* 右側: パレット登録 + 削除 */}
        <div className="flex items-center">
          {onPinToPalette && (
            <HoverTooltip
              content={
                isPinnedInPalette
                  ? t('common.actions.alreadyInPalette')
                  : t('common.actions.addToPalette')
              }
              side="bottom"
            >
              <button
                type="button"
                onClick={isPinnedInPalette ? undefined : onPinToPalette}
                className={cn(
                  'flex size-8 items-center justify-center rounded-lg transition-colors',
                  isPinnedInPalette
                    ? 'text-warning cursor-default'
                    : 'text-muted-foreground hover:text-foreground hover:bg-state-hover',
                )}
                aria-label={t('common.actions.addToPalette')}
                aria-pressed={isPinnedInPalette}
              >
                <Star className={cn('size-4', isPinnedInPalette && 'fill-current')} />
              </button>
            </HoverTooltip>
          )}
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
