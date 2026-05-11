'use client';

import { useMemo, useState } from 'react';

import { BarChart3, ChevronDown, ChevronRight } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';

import type { Tag, TagTreeNode } from '@/features/tags';
import { TagIcon, useTagsHierarchy } from '@/features/tags';
import { SidebarSection } from '@/lib/components/shell/sidebar';
import { Skeleton } from '@/lib/components/ui/skeleton';
import { HoverTooltip } from '@/lib/components/ui/tooltip';
import { cn } from '@/lib/utils';

import { useReviewFilterStore } from '../../stores/useReviewFilterStore';

function formatDateParam(date: Date): string {
  return date.toISOString().split('T')[0]!;
}

function findActiveTagId(pathname: string): string | null {
  const match = pathname.match(/\/review\/tags\/([^/?#]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function buildReviewTagPath(
  locale: string,
  tagId: string,
  date: Date,
  granularity: string,
): string {
  const params = new URLSearchParams({
    g: granularity,
    d: formatDateParam(date),
  });
  return `/${locale}/review/tags/${tagId}?${params.toString()}`;
}

function buildReviewPath(locale: string, date: Date, granularity: string): string {
  const params = new URLSearchParams({
    g: granularity,
    d: formatDateParam(date),
  });
  return `/${locale}/review?${params.toString()}`;
}

interface TagRowProps {
  tag: Tag;
  depth: 0 | 1;
  active: boolean;
  hasChildren?: boolean | undefined;
  collapsed?: boolean | undefined;
  onNavigate: (tagId: string) => void;
  onToggleCollapse?: (() => void) | undefined;
}

function TagRow({
  tag,
  depth: _depth,
  active,
  hasChildren = false,
  collapsed = false,
  onNavigate,
  onToggleCollapse,
}: TagRowProps) {
  const t = useTranslations('calendar.filter');

  return (
    <div
      className={cn(
        'group/tag flex h-8 min-w-0 cursor-pointer items-center rounded-lg text-sm transition-colors duration-150 [@media(pointer:coarse)]:min-h-11',
        active
          ? 'bg-state-selected text-foreground'
          : 'text-muted-foreground hover:bg-state-hover hover:text-foreground',
      )}
      onClick={() => onNavigate(tag.id)}
    >
      <span className="ml-2 shrink-0">
        <TagIcon icon={tag.icon} color={tag.color} size="sm" />
      </span>

      <HoverTooltip content={tag.name} side="top" wrapperClassName="ml-2 min-w-0 flex-1">
        <span className={cn('min-w-0 truncate', active && 'font-normal')}>{tag.name}</span>
      </HoverTooltip>

      {hasChildren ? (
        <button
          type="button"
          className="hover:bg-state-hover ml-1 flex size-6 shrink-0 items-center justify-center rounded-lg"
          aria-label={collapsed ? t('expand') : t('collapse')}
          onClick={(event) => {
            event.stopPropagation();
            onToggleCollapse?.();
          }}
        >
          {collapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
      ) : (
        <div className="w-1 shrink-0" />
      )}
    </div>
  );
}

interface TagGroupProps {
  node: TagTreeNode;
  activeTagId: string | null;
  collapsed: boolean;
  onNavigate: (tagId: string) => void;
  onToggleCollapse: () => void;
}

function TagGroup({ node, activeTagId, collapsed, onNavigate, onToggleCollapse }: TagGroupProps) {
  const hasChildren = node.children.length > 0;

  return (
    <div role="listitem" className="min-w-0">
      <TagRow
        tag={node.tag}
        depth={0}
        active={activeTagId === node.tag.id}
        hasChildren={hasChildren}
        collapsed={collapsed}
        onNavigate={onNavigate}
        onToggleCollapse={onToggleCollapse}
      />
      {hasChildren && !collapsed ? (
        <div
          role="list"
          className="mt-1 ml-4 space-y-1 rounded-xl border border-dashed border-transparent px-1 py-1"
        >
          {node.children.map((child) => (
            <TagRow
              key={child.id}
              tag={child}
              depth={1}
              active={activeTagId === child.id}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function OverallRow({ active, onNavigate }: { active: boolean; onNavigate: () => void }) {
  const t = useTranslations('calendar.stats');

  return (
    <button
      type="button"
      className={cn(
        'flex h-8 w-full min-w-0 cursor-pointer items-center rounded-lg text-sm transition-colors duration-150 [@media(pointer:coarse)]:min-h-11',
        active
          ? 'bg-state-selected text-foreground'
          : 'text-muted-foreground hover:bg-state-hover hover:text-foreground',
      )}
      onClick={onNavigate}
    >
      <span className="ml-2 shrink-0">
        <BarChart3 className="size-4" aria-hidden />
      </span>
      <span className={cn('ml-2 min-w-0 flex-1 truncate text-left', active && 'font-normal')}>
        {t('overall')}
      </span>
      <div className="w-1 shrink-0" />
    </button>
  );
}

/**
 * Review Sidebar 用タグナビゲーション。
 *
 * Calendar のタグ階層を同じ順序で表示し、クリックでタグ単体の統計に遷移する。
 */
export function ReviewTagList() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const currentDate = useReviewFilterStore((s) => s.currentDate);
  const granularity = useReviewFilterStore((s) => s.granularity);
  const { data: nodes, isLoading } = useTagsHierarchy();
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const activeTagId = useMemo(() => findActiveTagId(pathname), [pathname]);
  const isOverallActive = activeTagId === null;

  const handleOverallNavigate = () => {
    router.push(buildReviewPath(locale, currentDate, granularity));
  };

  const handleNavigate = (tagId: string) => {
    router.push(buildReviewTagPath(locale, tagId, currentDate, granularity));
  };

  const toggleGroupCollapse = (tagId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  };

  return (
    <div className="w-full min-w-0 space-y-2 overflow-hidden">
      <div className="px-0 py-1">
        <OverallRow active={isOverallActive} onNavigate={handleOverallNavigate} />
      </div>
      <SidebarSection title={t('calendar.filter.tags')} className="py-1">
        {isLoading ? (
          <div className="space-y-1 py-1">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        ) : nodes && nodes.length > 0 ? (
          <div role="list" className="space-y-1">
            {nodes.map((node) => (
              <TagGroup
                key={node.tag.id}
                node={node}
                activeTagId={activeTagId}
                collapsed={collapsedGroups.has(node.tag.id)}
                onNavigate={handleNavigate}
                onToggleCollapse={() => toggleGroupCollapse(node.tag.id)}
              />
            ))}
          </div>
        ) : (
          <div className="text-muted-foreground px-2 py-2 text-xs">
            {t('calendar.filter.noTags')}
          </div>
        )}
      </SidebarSection>
    </div>
  );
}
