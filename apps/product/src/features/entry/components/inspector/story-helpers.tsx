/**
 * Inspector Stories 共通ヘルパー
 *
 * Plan/Record の Inspector Stories で共通利用するモックデータとコンポーネント
 */

import { ChevronDown, Plus, Trash2 } from 'lucide-react';

import { TagIcon } from '@/features/tags';

/** Inspector風コンテナ（400px幅） */
export function InspectorFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-card shadow-card w-[400px] overflow-hidden rounded-2xl">{children}</div>
  );
}

/** モック用タグ行（Storybook用静的表示） */
export function MockTagRow({
  tagName,
  tagIcon,
  tagColor,
}: {
  tagName?: string | undefined;
  tagIcon?: string | null | undefined;
  tagColor?: string | null | undefined;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <button
        type="button"
        className="hover:bg-state-hover -mt-1 -ml-2 flex items-center gap-2 rounded-lg py-1 pr-2 pl-2 text-base font-medium transition-colors"
        aria-label={tagName ? `Tag: ${tagName}` : 'Add tag'}
      >
        {tagName ? (
          <>
            <TagIcon icon={tagIcon} color={tagColor} size="sm" />
            <span className="text-foreground">{tagName}</span>
            <ChevronDown className="text-muted-foreground size-4 flex-shrink-0" aria-hidden />
          </>
        ) : (
          <>
            <Plus className="text-muted-foreground size-3.5 flex-shrink-0" aria-hidden />
            <span className="text-muted-foreground">Add tag</span>
            <ChevronDown className="text-muted-foreground size-4 flex-shrink-0" aria-hidden />
          </>
        )}
      </button>

      <button
        type="button"
        className="text-muted-foreground hover:bg-state-hover -mr-2 flex size-8 items-center justify-center rounded-lg transition-colors"
        aria-label="Delete"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}
