'use client';

/**
 * タグ表示行（Pure props）
 *
 * カラードット + タグ名を表示し、クリックで TagQuickSelector を開く。
 * 右側に「…」メニュー（統計・削除）を配置。
 *
 * タグデータの解決とタグ作成は上位（EntryInspectorForm）が担当。
 */

import { useCallback, useRef, useState } from 'react';

import {
  BarChart3,
  CalendarOff,
  ChevronDown,
  MoreHorizontal,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import { TagIcon, TagQuickSelector } from '@/features/tags';
import { ColonTagLabel } from '@/lib/components/ui/colon-tag-label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/lib/components/ui/dropdown-menu';
import type { TagColorEntry } from '@/lib/tag-colors';

interface TagRowProps {
  tagId: string | null;
  /** 解決済みのタグ名 */
  tagName: string;
  /** 解決済みのタグ色クラス（tagId が null なら undefined） */
  tagColorClasses?: TagColorEntry | undefined;
  /** 解決済みのタグアイコン名（tagId が null なら undefined） */
  tagIcon?: string | null | undefined;
  /** 解決済みのタグ色名（tagIcon表示に使用） */
  tagColor?: string | null | undefined;
  onTagChange: (tagId: string | null) => void;
  /** タグ作成コールバック（上位で useCreateTag を呼ぶ） */
  onCreateAndSelect: (
    name: string,
    color?: string | null,
    icon?: string | null,
    parentId?: string | null,
  ) => void;
  /** 統計を見るコールバック */
  onViewStats?: (() => void) | undefined;
  /** 削除ボタンのコールバック */
  onDelete?: (() => void) | undefined;
  /** 計画外かどうか */
  isUnplanned?: boolean | undefined;
  /** 計画外にするコールバック */
  onMarkUnplanned?: (() => void) | undefined;
  /** 計画に戻すコールバック */
  onRestorePlanned?: (() => void) | undefined;
  /** Inspector を閉じるコールバック（Mobile Drawer のみ渡す。set されたら「…」の右に × を出す） */
  onCloseInspector?: (() => void) | undefined;
}

/** Inspectorのタグ選択行（カラードット + タグ名、クリックでQuickSelector表示） */
export function TagRow({
  tagId: _tagId,
  tagName,
  tagColorClasses: colorClasses,
  tagIcon,
  tagColor,
  onTagChange,
  onCreateAndSelect,
  onViewStats,
  onDelete,
  isUnplanned,
  onMarkUnplanned,
  onRestorePlanned,
  onCloseInspector,
}: TagRowProps) {
  const t = useTranslations();
  const [selectorOpen, setSelectorOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const hasMenuItems = onViewStats || onDelete || onMarkUnplanned || onRestorePlanned;

  const handleSelect = useCallback(
    (selectedTagId: string) => {
      onTagChange(selectedTagId);
      setSelectorOpen(false);
    },
    [onTagChange],
  );

  const handleCreateAndSelect = useCallback(
    async (name: string, color?: string | null, icon?: string | null, parentId?: string | null) => {
      await onCreateAndSelect(name, color, icon, parentId);
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
          className="hover:bg-state-hover -mt-1 -ml-2 flex min-w-0 items-center gap-2 rounded-lg py-1 pr-2 pl-2 text-lg font-medium transition-colors"
          aria-label={`${t('common.tags.change')}: ${tagName}`}
        >
          <TagIcon
            icon={tagIcon ?? null}
            color={tagColor ?? colorClasses?.cssVar}
            size="md"
            className="flex-shrink-0"
          />
          <ColonTagLabel name={tagName} className="text-foreground" />
          <ChevronDown className="text-muted-foreground size-4 flex-shrink-0" aria-hidden />
        </button>

        {/* 右側: … メニュー + close button（Mobile Drawer のみ） */}
        <div className="-mr-2 flex items-center">
          {hasMenuItems && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground hover:bg-state-hover flex size-10 items-center justify-center rounded-lg transition-colors"
                  aria-label={t('common.actions.more')}
                >
                  <MoreHorizontal className="size-5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onViewStats && (
                  <DropdownMenuItem onClick={onViewStats}>
                    <BarChart3 className="mr-2 size-4" />
                    {t('calendar.filter.viewStats')}
                  </DropdownMenuItem>
                )}
                {isUnplanned
                  ? onRestorePlanned && (
                      <DropdownMenuItem onClick={onRestorePlanned}>
                        <RotateCcw className="mr-2 size-4" />
                        {t('entry.inspector.restorePlanned')}
                      </DropdownMenuItem>
                    )
                  : onMarkUnplanned && (
                      <DropdownMenuItem onClick={onMarkUnplanned}>
                        <CalendarOff className="mr-2 size-4" />
                        {t('entry.inspector.markUnplanned')}
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
          {onCloseInspector && (
            <button
              type="button"
              onClick={onCloseInspector}
              className="text-muted-foreground hover:text-foreground hover:bg-state-hover flex size-10 items-center justify-center rounded-lg transition-colors"
              aria-label={t('common.actions.close')}
            >
              <X className="size-5" />
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
