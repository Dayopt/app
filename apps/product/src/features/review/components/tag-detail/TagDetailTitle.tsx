'use client';

/**
 * タグ詳細ページの見出し（タグスイッチャー）
 *
 * 現在表示中のタグ名をボタンとして描画し、クリックで TagQuickSelector を開く。
 * 他タグを選ぶとそのタグの詳細ページへ遷移する（= 表示中タグの切り替え）。
 * Calendar の TagRow と同じ TagQuickSelector / TagIcon を使う。
 */

import { useCallback, useRef, useState } from 'react';

import { ChevronDown } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

import { resolveTagColor, TagIcon, TagQuickSelector, useCreateTag } from '@/features/tags';
import { ColonTagLabel } from '@/lib/components/ui/colon-tag-label';
import { toast } from '@/lib/toast';

import type { ReviewGranularity } from '../../stores/useReviewFilterStore';

interface TagDetailTitleProps {
  tagId: string;
  tagName: string;
  tagIcon: string | null;
  tagColor: string | null;
  granularity: ReviewGranularity;
  dateStr: string;
}

/** タグ詳細ページの見出し。クリックで他タグへ切り替える */
export function TagDetailTitle({
  tagId,
  tagName,
  tagIcon,
  tagColor,
  granularity,
  dateStr,
}: TagDetailTitleProps) {
  const t = useTranslations();
  const tTags = useTranslations('tags');
  const locale = useLocale();
  const router = useRouter();
  const [selectorOpen, setSelectorOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const createTagMutation = useCreateTag({ showToast: false });

  const navigateToTag = useCallback(
    (nextTagId: string) => {
      router.push(`/${locale}/review/tags/${nextTagId}?g=${granularity}&d=${dateStr}`);
    },
    [router, locale, granularity, dateStr],
  );

  const handleSelect = useCallback(
    (selectedId: string) => {
      setSelectorOpen(false);
      if (selectedId === tagId) return;
      navigateToTag(selectedId);
    },
    [tagId, navigateToTag],
  );

  const handleCreateAndSelect = useCallback(
    async (name: string, color?: string | null, icon?: string | null, parentId?: string | null) => {
      setSelectorOpen(false);
      try {
        const newTag = await createTagMutation.mutateAsync({
          name,
          color: resolveTagColor(color),
          icon: icon ?? undefined,
          parentId: parentId ?? undefined,
        });
        navigateToTag(newTag.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('GROUP_NAME_CONFLICT') || message.includes('group_conflict')) {
          toast.error(tTags('errors.groupNameConflict'));
        } else if (message.includes('duplicate') || message.includes('already exists')) {
          toast.error(tTags('errors.duplicateName'));
        } else {
          toast.error(tTags('errors.createFailed'));
        }
      }
    },
    [createTagMutation, navigateToTag, tTags],
  );

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setSelectorOpen(true)}
        className="hover:bg-state-hover -ml-2 flex min-w-0 items-center gap-2 rounded-lg px-2 py-1 transition-colors"
        aria-label={`${t('common.tags.change')}: ${tagName}`}
      >
        <TagIcon icon={tagIcon} color={tagColor} size="md" className="shrink-0" />
        <ColonTagLabel
          name={tagName}
          className="text-foreground min-w-0 truncate text-xl font-medium"
        />
        <ChevronDown className="text-muted-foreground size-4 shrink-0" aria-hidden />
      </button>

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
