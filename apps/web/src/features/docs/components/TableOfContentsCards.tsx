'use client';

import { TocLinks } from './AutoTableOfContents';
import { ClientTableOfContents } from './ClientTableOfContents';

interface TableOfContentsCardsProps {
  content?: string;
}

/**
 * 目次を「目次 card」と「リンク card」の2枚に分けて縦に並べる共通レイアウト。
 * blog 記事・docs 記事の両方で使用する（sticky 位置・余白は呼び出し側で指定）。
 */
export function TableOfContentsCards({ content }: TableOfContentsCardsProps) {
  if (!content) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* card 1: 目次（スクロールコンテナと padding を分離し、スクロールバーで右だけ
          狭くならないようにする。padding はスクロールしない外側ではなく内側の div に持たせる） */}
      <div className="bg-card text-card-foreground border-border max-h-[60vh] overflow-y-auto rounded-lg border">
        <div className="p-4">
          <ClientTableOfContents content={content} showLinks={false} />
        </div>
      </div>
      {/* card 2: リンク（Issue 報告 / ソース） */}
      <div className="bg-card text-card-foreground border-border rounded-lg border p-4">
        <TocLinks />
      </div>
    </div>
  );
}
