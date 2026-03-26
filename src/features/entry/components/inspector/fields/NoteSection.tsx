'use client';

/**
 * メモ入力行
 *
 * DateRow / TimeRow と同じ「ラベル + コンテンツ」形式。
 * プレーンテキスト textarea をインライン表示。
 *
 * 既存データが HTML 形式の場合は自動的にタグを除去して表示。
 * 保存はプレーンテキストで行う。
 *
 * textarea は入力に合わせて自動拡張し、max-h-20（80px ≈ 3行）で内部スクロールに切り替わる。
 */

import type { LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef } from 'react';

/** max-h-40 = 10rem = 160px（Tailwind クラスと同期） */
const TEXTAREA_MAX_HEIGHT = 160;

/** HTML タグを除去してプレーンテキストに変換 */
function stripHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

interface NoteSectionProps {
  label: string;
  icon?: LucideIcon;
  note: string;
  onNoteChange: (text: string) => void;
  placeholder?: string | undefined;
  disabled?: boolean;
  maxLength?: number;
}

/** Inspectorのメモ入力行（自動拡張textarea、HTMLタグ自動除去対応） */
export function NoteSection({
  label,
  icon: Icon,
  note,
  onNoteChange,
  placeholder,
  disabled = false,
  maxLength = 1000,
}: NoteSectionProps) {
  const displayNote = useMemo(() => stripHtml(note), [note]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /** textarea の高さをコンテンツに合わせて自動調整（max-height 超過時のみスクロール表示） */
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.overflowY = 'hidden';
    el.style.height = 'auto';
    const scrollH = el.scrollHeight;
    el.style.height = `${scrollH}px`;
    // max-height（max-h-20 = 80px）を超えた場合のみスクロール表示
    if (scrollH > TEXTAREA_MAX_HEIGHT) {
      el.style.overflowY = 'auto';
    }
  }, []);

  // 値が外部から変わったときも高さを再調整
  useEffect(() => {
    adjustHeight();
  }, [displayNote, adjustHeight]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="text-muted-foreground size-4 flex-shrink-0" />}
          <span className="text-muted-foreground text-sm">{label}</span>
        </div>
        <span className="text-muted-foreground -mr-2 px-2 text-xs tabular-nums">
          {displayNote.length}/{maxLength}
        </span>
      </div>
      <textarea
        ref={textareaRef}
        value={displayNote}
        onChange={(e) => {
          onNoteChange(e.target.value);
          adjustHeight();
        }}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={maxLength}
        rows={1}
        className="bg-input text-foreground placeholder:text-muted-foreground focus-visible:ring-ring max-h-40 min-h-8 resize-none overflow-y-hidden rounded-lg border border-transparent px-4 py-2 text-sm leading-normal shadow-inner outline-none focus-visible:ring-2"
      />
    </div>
  );
}
