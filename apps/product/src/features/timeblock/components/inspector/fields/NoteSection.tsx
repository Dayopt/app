'use client';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';

import { Textarea } from '@dayopt/components';

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
  const [localNote, setLocalNote] = useState(displayNote);
  const [isFocused, setIsFocused] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [previousDisplayNote, setPreviousDisplayNote] = useState(displayNote);

  if (previousDisplayNote !== displayNote) {
    setPreviousDisplayNote(displayNote);
    if (!isFocused) setLocalNote(displayNote);
  }

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
          {localNote.length}/{maxLength}
        </span>
      </div>
      {showLinkifiedNote ? (
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          // -mx-2 + px-2: ホバー領域の左右に8pxの余白を確保しつつ、負のmarginで
          // 打ち消してテキスト自体は親コンテナのcontent edgeに揃える（bg-input等の
          // 常時背景・独立ボックス感は撤去し、カード内の軽いインライン操作に見せる。User指示）。
          className="text-foreground hover:bg-state-hover focus-visible:ring-ring relative -mx-2 flex max-h-40 min-h-11 cursor-text items-center overflow-y-auto rounded-lg px-2 py-2 text-left text-sm leading-normal outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
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
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          aria-label={label}
        >
          <span className="block w-full text-left text-sm leading-normal">
            {shouldShowPlaceholder && placeholder ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : (
              renderNoteWithLinks(displayNote)
            )}
          </span>
        </div>
      ) : (
        // 高さ確保（min-h-11）とホバー/フォーカスの視覚（rounded-lg・hover:bg-state-hover・
        // focus-within:ring）はこのラッパーが担う。textarea自身はfield-sizing-contentで
        // 内容ぴったりの高さになり、それをラッパーがitems-centerで縦中央に置くため、
        // 表示div（1行なら中央寄せ）と編集開始直後で文字の縦位置がズレない
        // （textarea自身にmin-h-11を付けると、1行の文字はtextarea内部で上詰めのまま
        // 描画され、表示div側の中央寄せと数px食い違って「入力時に少し上へ動く」ように
        // 見えていた。User指摘）。
        <div className="hover:bg-state-hover focus-within:ring-ring -mx-2 flex min-h-11 items-center rounded-lg px-2 py-2 focus-within:ring-2">
          {/*
            @dayopt/components の Textarea（shadcn/ui由来）をアクセシビリティ・入力挙動の
            基盤として使い、見た目はclassNameで上書きしてこのInspectorの他フィールドに揃える
            （常時のbg-input/border/shadow-xs/px-4/min-h-16を打ち消し、フォーカスリングは
            二重にならないようこのラッパー側のfocus-withinへ一本化する。User指示）。
          */}
          <Textarea
            value={localNote}
            // 表示用divをクリックしてこのtextareaへ切り替わる瞬間にだけマウントされるため、
            // ここでfocusしないとクリックが一度目は編集モードへの切り替えにしか使われず、実際に入力するには二度目のクリックが必要になる
            autoFocus
            onChange={(event) => {
              setLocalNote(event.target.value);
              onNoteChange(event.target.value);
            }}
            onFocus={(event) => {
              setIsFocused(true);
              const { length } = event.currentTarget.value;
              event.currentTarget.setSelectionRange(length, length);
            }}
            onBlur={() => {
              setIsFocused(false);
              setIsEditing(false);
              setLocalNote(displayNote);
            }}
            placeholder={placeholder}
            disabled={disabled}
            maxLength={maxLength}
            aria-label={label}
            rows={1}
            // border-0でボーダー幅そのものを0にする（border-transparentだけだと色が
            // 透明になるだけで幅1pxはボックスサイズに残り、表示div側（ボーダー無し）との
            // 間で縦位置が1px未満ズレる原因になっていた。User指摘の layout shift 対策）。
            className="max-h-40 min-h-0 w-full resize-none overflow-y-auto border-0 bg-transparent px-0 py-0 text-sm leading-normal shadow-none outline-none focus-visible:ring-0"
          />
        </div>
      )}
    </div>
  );
}
