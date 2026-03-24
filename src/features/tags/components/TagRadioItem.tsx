'use client';

import { Check } from 'lucide-react';

import { getTagColorClasses } from '@/lib/tag-colors';
import { cn } from '@/lib/utils';

interface TagRadioItemProps {
  tag: { id: string; color: string | null };
  label: string;
  isSelected: boolean;
  onSelect: () => void;
  onHover?: ((tag: { id: string; name: string; color: string | null }) => void) | undefined;
  onHoverEnd?: (() => void) | undefined;
  indented?: boolean;
  disabled?: boolean;
}

/**
 * ラジオ風タグアイテム
 *
 * タグ選択UIで共通利用。色付きラジオインジケーター + タグ名。
 */
export function TagRadioItem({
  tag,
  label,
  isSelected,
  onSelect,
  onHover,
  onHoverEnd,
  indented,
  disabled,
}: TagRadioItemProps) {
  const colorClasses = getTagColorClasses(tag.color);

  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={
        onHover ? () => onHover({ id: tag.id, name: label, color: tag.color }) : undefined
      }
      onMouseLeave={onHoverEnd}
      disabled={disabled}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
        'hover:bg-state-hover active:bg-state-hover',
        'min-h-11',
        indented && 'pl-9',
        disabled && 'pointer-events-none opacity-40',
      )}
      role="radio"
      aria-checked={isSelected}
    >
      {/* Radio indicator */}
      <div
        className={cn(
          'flex size-5 shrink-0 items-center justify-center rounded-full border-2',
          isSelected ? 'border-transparent' : 'opacity-50',
        )}
        style={{
          backgroundColor: isSelected ? colorClasses.cssVar : 'transparent',
          borderColor: colorClasses.cssVar,
        }}
      >
        {isSelected && <Check className="size-3 text-white" />}
      </div>

      {/* Tag name */}
      <span className="truncate">{label}</span>
    </button>
  );
}
