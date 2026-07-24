'use client';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';

import { convertNoteHtmlToText } from './note-html-to-text';

interface NoteSectionProps {
  label: string;
  icon?: LucideIcon | undefined;
  note: string;
  onNoteChange: (text: string) => void;
  placeholder?: string | undefined;
  disabled?: boolean | undefined;
  maxLength?: number | undefined;
}

function splitTrailingPunctuation(url: string): {
  value: string;
  suffix: string;
} {
  let end = url.length;
  while (end > 0) {
    const char = url[end - 1];
    if (char !== undefined && /[\])}>"'\u3001\u3002.,!?;:、。!?]/.test(char)) {
      end -= 1;
    } else {
      break;
    }
  }
  return {
    value: url.slice(0, end),
    suffix: url.slice(end),
  };
}

function renderNoteWithLinks(note: string): ReactNode {
  const urlRegex = /(?:https?:\/\/|www\.)[^\s<>"'`]+/g;

  const renderLine = (line: string, lineIndex: number) => {
    const nodes: Array<ReactNode> = [];
    let lastIndex = 0;
    const matches = Array.from(line.matchAll(urlRegex));

    matches.forEach((match, matchIndex) => {
      if (match.index === undefined) return;

      if (match.index > lastIndex) {
        nodes.push(
          <span key={`text-${lineIndex}-${matchIndex}-prefix`}>
            {line.slice(lastIndex, match.index)}
          </span>,
        );
      }

      const token = match[0];
      const { value: urlValue, suffix } = splitTrailingPunctuation(token);
      const href = urlValue.startsWith('www.') ? `https://${urlValue}` : urlValue;

      nodes.push(
        <a
          key={`link-${lineIndex}-${matchIndex}`}
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-primary hover:text-primary/90 underline underline-offset-2"
          onClick={(event) => event.stopPropagation()}
        >
          {urlValue}
        </a>,
      );

      if (suffix.length > 0) {
        nodes.push(<span key={`text-${lineIndex}-${matchIndex}-suffix`}>{suffix}</span>);
      }
      lastIndex = match.index + token.length;
    });

    if (lastIndex < line.length) {
      nodes.push(<span key={`text-${lineIndex}-tail`}>{line.slice(lastIndex)}</span>);
    }

    return <span key={`line-${lineIndex}`}>{nodes.length > 0 ? nodes : line}</span>;
  };

  const lines = note.split('\n');
  return (
    <p className="whitespace-pre-wrap">
      {lines.map((line, lineIndex, all) => {
        const lineNode = renderLine(line, lineIndex);
        if (lineIndex === all.length - 1) return lineNode;
        return (
          <span key={`line-wrap-${lineIndex}`}>
            {lineNode}
            <br />
          </span>
        );
      })}
    </p>
  );
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
  const displayNote = useMemo(() => convertNoteHtmlToText(note), [note]);
  const [isEditing, setIsEditing] = useState(false);

  const showLinkifiedNote = !isEditing || disabled;
  const shouldShowPlaceholder = displayNote.length === 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="text-muted-foreground size-4 shrink-0" />}
          <span className="text-muted-foreground text-sm">{label}</span>
        </div>
        <span className="text-muted-foreground -mr-2 px-2 text-xs tabular-nums">
          {displayNote.length}/{maxLength}
        </span>
      </div>
      {showLinkifiedNote ? (
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          className="bg-input text-foreground hover:bg-state-hover focus-visible:ring-ring relative flex max-h-40 min-h-11 cursor-text items-start overflow-y-auto rounded-lg border border-transparent px-4 py-2 text-left text-sm leading-normal shadow-xs outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => {
            if (!disabled) {
              setIsEditing(true);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setIsEditing(true);
            }
          }}
          aria-label={label}
        >
          <span className="block min-h-6 w-full text-left text-sm leading-normal">
            {shouldShowPlaceholder && placeholder ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : (
              renderNoteWithLinks(displayNote)
            )}
          </span>
        </div>
      ) : (
        <textarea
          value={displayNote}
          onChange={(event) => onNoteChange(event.target.value)}
          onBlur={() => {
            setIsEditing(false);
          }}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={maxLength}
          aria-label={label}
          rows={1}
          className="bg-input text-foreground placeholder:text-muted-foreground focus-visible:ring-ring field-sizing-content max-h-40 min-h-11 resize-none overflow-y-auto rounded-lg border border-transparent px-4 py-2 text-sm leading-normal shadow-xs outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
        />
      )}
    </div>
  );
}
