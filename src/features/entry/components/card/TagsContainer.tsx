/**
 * タグコンテナ - 横幅に応じて表示できるだけタグを表示し、隠れたタグは+Nで表示
 * IntersectionObserverを使用して可視タグ数を検出
 *
 * tagIdsを受け取り、タグマスタから詳細情報をルックアップする。
 * これにより、タグマスタの変更が即時反映される。
 */

'use client';

import { memo, useEffect, useRef, useState } from 'react';

import { useTagsMap } from '@/features/tags';
import { getTagColorClasses } from '@/lib/tag-colors';
import { cn } from '@/lib/utils';

interface TagsContainerProps {
  tagIds: string[];
}

export const TagsContainer = memo<TagsContainerProps>(function TagsContainer({ tagIds }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { getTagsByIds, isLoading } = useTagsMap();

  // タグマスタからタグ情報を取得
  const tags = getTagsByIds(tagIds);

  const [visibleCount, setVisibleCount] = useState(tags.length);

  // tagIdsはあるがタグ情報がまだ取得できていない場合のスケルトン表示
  const showSkeleton = isLoading && tagIds.length > 0 && tags.length === 0;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || tags.length === 0) return;

    // タグ要素を取得（+N要素を除く）
    const tagElements = container.querySelectorAll('[data-tag]');
    if (tagElements.length === 0) return;

    // 各タグの可視状態を追跡
    const visibilityMap = new Map<Element, boolean>();
    tagElements.forEach((el) => visibilityMap.set(el, true));

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          visibilityMap.set(entry.target, entry.isIntersecting);
        });

        // 可視タグ数をカウント
        let visible = 0;
        visibilityMap.forEach((isVisible) => {
          if (isVisible) visible++;
        });
        setVisibleCount(visible);
      },
      {
        root: container,
        threshold: 0.5, // 50%以上見えていれば可視とみなす
      },
    );

    tagElements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [tags]);

  const hiddenCount = tags.length - visibleCount;

  // ローディング中でタグIDがある場合はスケルトン表示
  if (showSkeleton) {
    return (
      <div className="flex min-h-0 flex-shrink flex-wrap gap-1 overflow-hidden pt-1">
        {tagIds.slice(0, 3).map((id) => (
          <span
            key={id}
            className="bg-muted inline-flex h-5 w-12 animate-pulse items-center rounded"
          />
        ))}
        {tagIds.length > 3 && (
          <span className="inline-flex items-center px-1 text-xs opacity-75">
            +{tagIds.length - 3}
          </span>
        )}
      </div>
    );
  }

  if (tags.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="flex min-h-0 flex-shrink flex-wrap gap-1 overflow-hidden pt-1"
    >
      {tags.map((tag) => (
        <span
          key={tag.id}
          data-tag
          className={cn(
            'inline-flex items-center rounded border px-2 py-1 text-xs leading-tight',
            getTagColorClasses(tag.color).border,
          )}
          title={tag.name}
        >
          {tag.name}
        </span>
      ))}
      {hiddenCount > 0 && (
        <span className="inline-flex items-center px-1 text-xs opacity-75">+{hiddenCount}</span>
      )}
    </div>
  );
});
