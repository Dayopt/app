'use client';

import type { LucideIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

interface NoteSectionProps {
  label: string;
  icon?: LucideIcon | undefined;
  note: string;
  onNoteChange: (text: string) => void;
  placeholder?: string | undefined;
  disabled?: boolean | undefined;
  maxLength?: number | undefined;
}

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

/** Inspector専用の、内容に合わせて伸びるコンパクトなメモ入力欄。 */
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
  const [localNote, setLocalNote] = useState(displayNote);
  const [isFocused, setIsFocused] = useState(false);
  const [previousDisplayNote, setPreviousDisplayNote] = useState(displayNote);

  if (previousDisplayNote !== displayNote) {
    setPreviousDisplayNote(displayNote);
    if (!isFocused) setLocalNote(displayNote);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="text-muted-foreground size-4 shrink-0" />}
          <span className="text-muted-foreground text-sm">{label}</span>
        </div>
        <span className="text-muted-foreground -mr-2 px-2 text-xs tabular-nums">
          {localNote.length}/{maxLength}
        </span>
      </div>
      <textarea
        value={localNote}
        onChange={(event) => {
          setLocalNote(event.target.value);
          onNoteChange(event.target.value);
        }}
        onFocus={() => setIsFocused(true)}
        onBlur={() => {
          setIsFocused(false);
          setLocalNote(displayNote);
        }}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={maxLength}
        aria-label={label}
        rows={1}
        className="bg-input text-foreground placeholder:text-muted-foreground focus-visible:ring-ring field-sizing-content max-h-40 min-h-11 resize-none overflow-y-auto rounded-lg border border-transparent px-4 py-2 text-sm leading-normal shadow-xs outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  );
}
