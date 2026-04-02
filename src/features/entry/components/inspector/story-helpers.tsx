/**
 * Inspector Stories 共通ヘルパー
 *
 * Plan/Record の Inspector Stories で共通利用するモックデータとコンポーネント
 */

import { Bell, ChevronDown, FolderOpen, Plus, Trash2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { HoverTooltip } from '@/components/ui/tooltip';
import type { Tag } from '@/features/tags';
import { TagIcon } from '@/features/tags';
import { cn } from '@/lib/utils';

/** Inspector風コンテナ（400px幅） */
export function InspectorFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-card shadow-card w-[400px] overflow-hidden rounded-2xl">{children}</div>
  );
}

/** Plan紐付けボタン（静的表示 / Storybook用モック） */
export function MockPlanLinkButton({ planName }: { planName?: string | undefined }) {
  const hasPlan = !!planName;

  return (
    <HoverTooltip content={planName ?? 'Planに紐付け'} side="top">
      <div
        className={cn(
          'hover:bg-state-hover flex h-8 items-center rounded-lg transition-colors',
          hasPlan ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <button
          type="button"
          className="focus-visible:ring-ring flex items-center gap-1 px-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
          aria-label="Planに紐付け"
        >
          <FolderOpen className="size-4" />
          {hasPlan && <span className="max-w-20 truncate text-xs">{planName}</span>}
        </button>
        {hasPlan && (
          <button
            type="button"
            className="hover:bg-state-hover mr-1 rounded-lg p-1 transition-colors"
            aria-label="Plan紐付けを解除"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
    </HoverTooltip>
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
        className="hover:bg-state-hover -mt-1 -ml-2 flex items-center gap-2 rounded-lg py-1 pr-2 pl-2 text-base font-bold transition-colors"
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

/** モック用リマインダー行（ReminderRow は store 依存のためモック） */
export function MockReminderRow() {
  const t = useTranslations();
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Bell className="text-muted-foreground size-4 flex-shrink-0" />
        <span className="text-muted-foreground text-sm">{t('common.reminder.label')}</span>
      </div>
      <div className="-mr-2">
        <button
          type="button"
          className="text-muted-foreground hover:bg-state-hover inline-flex h-8 items-center gap-1 rounded-lg px-2 text-sm transition-colors"
          aria-label="Add reminder"
        >
          {t('common.reminder.add')}
        </button>
      </div>
    </div>
  );
}

/** モック用タグデータ */
export const mockTags: Tag[] = [
  {
    id: 'tag-1',
    name: '仕事',
    user_id: 'user-1',
    color: 'blue',
    icon: null,
    is_active: true,
    sort_order: 0,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'tag-2',
    name: '重要',
    user_id: 'user-1',
    color: 'red',
    icon: null,
    is_active: true,
    sort_order: 1,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'tag-3',
    name: '個人',
    user_id: 'user-1',
    color: 'green',
    icon: null,
    is_active: true,
    sort_order: 2,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
];
