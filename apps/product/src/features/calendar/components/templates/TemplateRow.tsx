'use client';

import { useRef, useState } from 'react';

import { GripVertical } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn, Popover, PopoverContent, PopoverTrigger } from '@dayopt/components';

import { MiniDayPreview } from './MiniDayPreview';
import { TemplateContextMenu } from './TemplateContextMenu';
import type { TemplateMock } from './types';

type TemplateRowVisualState = 'idle' | 'applying' | 'dragging';

interface TemplateRowProps {
  template: TemplateMock;
  /** クリック適用・ドラッグ中などの静的な視覚状態（Storybook 確認用） */
  visualState?: TemplateRowVisualState | undefined;
  onApply?: (() => void) | undefined;
  onRename?: ((name: string) => void) | undefined;
  onDelete?: (() => void) | undefined;
}

/**
 * サイドバーのテンプレート行（v1.0 §5.4）。
 *
 * 見る＝ホバーでミニチュア日ビューのプレビュー。使う＝クリックで適用、
 * ドラッグで任意の日へ。統治（改名・削除）は右クリックに畳む。
 *
 * この component は Storybook-only の視覚確認用で、実際のドラッグ挙動・
 * 適用 mutation・改名 mutation は本 issue の非 scope（後続の実装 issue）。
 * `visualState` は「クリック適用中」「ドラッグ中」の見た目を Story で
 * 静的に確認するためのフラグで、実インタラクションの state machine ではない。
 */
export function TemplateRow({
  template,
  visualState = 'idle',
  onApply,
  onRename,
  onDelete,
}: TemplateRowProps) {
  const t = useTranslations();
  const [isHovered, setIsHovered] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(template.name);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
  };

  const handleStartRename = () => {
    setRenameValue(template.name);
    setIsRenaming(true);
    // フォーカスは input mount 後の次 tick で当てる
    requestAnimationFrame(() => renameInputRef.current?.select());
  };

  const commitRename = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== template.name) {
      onRename?.(trimmed);
    }
    setIsRenaming(false);
  };

  return (
    <div
      data-template-row
      data-visual-state={visualState}
      className={cn(
        'group/template-row relative flex min-w-0 items-center gap-2 rounded-lg px-2 py-1',
        visualState === 'dragging' ? 'opacity-30' : 'hover:bg-state-hover',
        visualState === 'applying' && 'bg-state-hover',
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onContextMenu={handleContextMenu}
    >
      <GripVertical
        aria-hidden="true"
        className="text-muted-foreground size-3.5 shrink-0 cursor-grab opacity-0 transition-opacity group-hover/template-row:opacity-100"
      />

      <Popover open={isHovered && !isRenaming}>
        <PopoverTrigger asChild>
          {isRenaming ? (
            <input
              ref={renameInputRef}
              aria-label={t('calendar.templates.renameLabel')}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') setIsRenaming(false);
              }}
              className="border-border bg-background text-foreground w-full min-w-0 rounded-lg border px-2 py-1 text-sm outline-none"
            />
          ) : (
            <button
              type="button"
              className="text-foreground min-w-0 flex-1 truncate text-left text-sm"
              onClick={() => onApply?.()}
            >
              {template.name}
            </button>
          )}
        </PopoverTrigger>
        <PopoverContent side="right" align="start" className="h-64 w-40 p-2">
          <MiniDayPreview blocks={template.blocks} />
        </PopoverContent>
      </Popover>

      {contextMenuPosition && (
        <TemplateContextMenu
          position={contextMenuPosition}
          onClose={() => setContextMenuPosition(null)}
          onRename={handleStartRename}
          onDelete={() => onDelete?.()}
        />
      )}

      <span className="sr-only">
        {t('calendar.templates.rowAriaHint', { name: template.name })}
      </span>
    </div>
  );
}
