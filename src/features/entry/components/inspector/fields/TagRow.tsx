'use client';

/**
 * タグ表示行（Pure props）
 *
 * カラードット + タグ名を表示し、クリックで TagQuickSelector を開く。
 * タグ未設定時は「タグを追加」を表示。
 * 右側に「…」メニュー（パレット登録・統計・削除）を配置。
 *
 * タグデータの解決とタグ作成は上位（EntryInspectorForm）が担当。
 */

import { useCallback, useRef, useState } from 'react';

import { BarChart3, ChevronDown, MoreHorizontal, Pin, PinOff, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { ColonTagLabel } from '@/components/ui/colon-tag-label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TagIcon, TagQuickSelector } from '@/features/tags';
import type { TagColorEntry } from '@/lib/tag-colors';

interface TagRowProps {
  tagId: string | null;
  /** 解決済みのタグ名（tagId が null なら undefined） */
  tagName?: string | undefined;
  /** 解決済みのタグ色クラス（tagId が null なら undefined） */
  tagColorClasses?: TagColorEntry | undefined;
  /** 解決済みのタグアイコン名（tagId が null なら undefined） */
  tagIcon?: string | null | undefined;
  /** 解決済みのタグ色名（tagIcon表示に使用） */
  tagColor?: string | null | undefined;
  onTagChange: (tagId: string | null) => void;
  /** タグ作成コールバック（上位で useCreateTag を呼ぶ） */
  onCreateAndSelect: (name: string, color?: string | null, icon?: string | null) => void;
  /** パレットに登録するコールバック（タグ+時間が有効な場合のみ表示） */
  onPinToPalette?: (() => void) | undefined;
  /** パレットから解除するコールバック */
  onUnpinFromPalette?: (() => void) | undefined;
  /** パレット登録済みかどうか */
  isPinnedInPalette?: boolean | undefined;
  /** 統計を見るコールバック */
  onViewStats?: (() => void) | undefined;
  /** 削除ボタンのコールバック */
  onDelete?: (() => void) | undefined;
}

/** Inspectorのタグ選択行（カラードット + タグ名、クリックでQuickSelector表示） */
export function TagRow({
  tagId,
  tagName,
  tagColorClasses: colorClasses,
  tagIcon,
  tagColor,
  onTagChange,
  onCreateAndSelect,
  onPinToPalette,
  onUnpinFromPalette,
  isPinnedInPalette,
  onViewStats,
  onDelete,
}: TagRowProps) {
  const t = useTranslations();
  const [selectorOpen, setSelectorOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const hasTag = tagId != null && tagName != null;
  const hasMenuItems = onPinToPalette || onUnpinFromPalette || onViewStats || onDelete;

  const handleSelect = useCallback(
    (selectedTagId: string) => {
      onTagChange(selectedTagId);
      setSelectorOpen(false);
    },
    [onTagChange],
  );

  const handleCreateAndSelect = useCallback(
    async (name: string, color?: string | null, icon?: string | null) => {
      await onCreateAndSelect(name, color, icon);
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
          className="hover:bg-state-hover -mt-1 -ml-2 flex min-w-0 items-center gap-2 rounded-lg py-1 pr-2 pl-2 text-lg font-bold transition-colors"
          aria-label={hasTag ? `${t('common.tags.change')}: ${tagName}` : t('common.tags.add')}
        >
          {hasTag ? (
            <>
              <TagIcon
                icon={tagIcon ?? null}
                color={tagColor ?? colorClasses?.cssVar}
                size="md"
                className="flex-shrink-0"
              />
              <ColonTagLabel name={tagName} className="text-foreground" />
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

        {/* 右側: … メニュー */}
        {hasMenuItems && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground hover:bg-state-hover -mr-2 flex size-10 items-center justify-center rounded-lg transition-colors"
                aria-label={t('common.actions.more')}
              >
                <MoreHorizontal className="size-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isPinnedInPalette && onUnpinFromPalette ? (
                <DropdownMenuItem onClick={onUnpinFromPalette}>
                  <PinOff className="mr-2 size-4" />
                  {t('common.actions.removeFromPalette')}
                </DropdownMenuItem>
              ) : (
                onPinToPalette && (
                  <DropdownMenuItem onClick={onPinToPalette}>
                    <Pin className="mr-2 size-4" />
                    {t('common.actions.addToPalette')}
                  </DropdownMenuItem>
                )
              )}
              {onViewStats && (
                <DropdownMenuItem onClick={onViewStats}>
                  <BarChart3 className="mr-2 size-4" />
                  {t('calendar.filter.viewStats')}
                </DropdownMenuItem>
              )}
              {onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onDelete} variant="destructive">
                    <Trash2 className="mr-2 size-4" />
                    {t('common.actions.delete')}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
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
