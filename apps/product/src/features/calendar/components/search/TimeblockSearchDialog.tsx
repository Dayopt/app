'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { LoaderCircle, SearchX } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { TagIcon, useTags } from '@/features/tags';
import { useDebouncedCallback } from '@/lib/hooks/useDebounce';
import { useUserPreferences } from '@/lib/hooks/useUserPreferences';
import { api } from '@/lib/trpc';
import {
  Button,
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@dayopt/components';

import {
  mergeTimeblockSearchResults,
  type TimeblockSearchResult,
} from '../../lib/timeblock-search-results';

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_FETCH_LIMIT = 21;
const SEARCH_DISPLAY_LIMIT = 20;

interface TimeblockSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenResult: (result: TimeblockSearchResult) => void;
}

interface SearchTag {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
}

interface TimeblockSearchContentProps {
  query: string;
  results: readonly TimeblockSearchResult[];
  tagsById: ReadonlyMap<string, SearchTag>;
  isLoading: boolean;
  isError: boolean;
  hasMore: boolean;
  locale: string;
  timezone: string;
  timeFormat: '24h' | '12h';
  onOpenResult: (result: TimeblockSearchResult) => void;
  onRetry: () => void;
}

function formatResultDateTime(
  result: TimeblockSearchResult,
  locale: string,
  timezone: string,
  timeFormat: '24h' | '12h',
): string {
  const start = new Date(result.startAt);
  const end = new Date(result.endAt);
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const timeFormatter = new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: timeFormat === '12h',
  });
  const dateKeyFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const startLabel = `${dateFormatter.format(start)} ${timeFormatter.format(start)}`;
  const endLabel =
    dateKeyFormatter.format(start) === dateKeyFormatter.format(end)
      ? timeFormatter.format(end)
      : `${dateFormatter.format(end)} ${timeFormatter.format(end)}`;

  return `${startLabel}–${endLabel}`;
}

/** @public Storybook / unit testで各query状態を固定表示するpresentational boundary。 */
export function TimeblockSearchContent({
  query,
  results,
  tagsById,
  isLoading,
  isError,
  hasMore,
  locale,
  timezone,
  timeFormat,
  onOpenResult,
  onRetry,
}: TimeblockSearchContentProps) {
  const t = useTranslations();
  const hasQuery = query.trim().length > 0;

  if (!hasQuery) {
    return (
      <div className="text-muted-foreground flex min-h-40 items-center justify-center px-6 text-center text-sm">
        {t('calendar.search.initial')}
      </div>
    );
  }

  if (isError) {
    return (
      <div
        className="flex min-h-40 flex-col items-center justify-center gap-3 px-6 text-center"
        role="alert"
      >
        <SearchX className="text-muted-foreground size-5" aria-hidden="true" />
        <p className="text-sm">{t('calendar.search.error')}</p>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          {t('calendar.search.retry')}
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        className="text-muted-foreground flex min-h-40 items-center justify-center gap-2 px-6 text-sm"
        role="status"
      >
        <LoaderCircle
          className="size-4 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
        {t('calendar.search.loading')}
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div
        className="text-muted-foreground flex min-h-40 items-center justify-center px-6 text-center text-sm"
        role="status"
      >
        {t('calendar.search.empty')}
      </div>
    );
  }

  return (
    <>
      <CommandGroup heading={t('calendar.search.results')}>
        {results.map((result, index) => {
          const tag = result.tagId ? tagsById.get(result.tagId) : undefined;
          const displayTitle = result.title || t('timeblock.untitled');
          const searchableValue = [query, result.kind, result.title, result.note, tag?.name, index]
            .filter((value) => value != null)
            .join(' ');

          return (
            <CommandItem
              key={`${result.kind}:${result.id}`}
              value={searchableValue}
              className="min-h-16 w-full gap-3 py-2"
              onSelect={() => onOpenResult(result)}
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="border-border text-muted-foreground shrink-0 rounded border px-1.5 py-0.5 text-xs">
                    {t(`calendar.search.kind.${result.kind}`)}
                  </span>
                  {result.isSkipped ? (
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {t('calendar.search.skipped')}
                    </span>
                  ) : null}
                  {tag ? (
                    <span className="text-muted-foreground flex min-w-0 items-center gap-1 text-xs">
                      <TagIcon icon={tag.icon} color={tag.color} size="sm" />
                      <span className="truncate">{tag.name}</span>
                    </span>
                  ) : null}
                </div>
                <p className="truncate text-sm font-medium">{displayTitle}</p>
                {result.note ? (
                  <p className="text-muted-foreground line-clamp-1 text-xs">{result.note}</p>
                ) : null}
                <p className="text-muted-foreground text-xs tabular-nums">
                  {formatResultDateTime(result, locale, timezone, timeFormat)}
                </p>
              </div>
            </CommandItem>
          );
        })}
      </CommandGroup>
      {hasMore ? (
        <p className="border-border text-muted-foreground border-t px-4 py-3 text-xs" role="note">
          {t('calendar.search.overflow', { count: SEARCH_DISPLAY_LIMIT })}
        </p>
      ) : null}
    </>
  );
}

/** 全期間のPlan / Recordを検索するCalendar-owned dialog。 */
export function TimeblockSearchDialog({
  open,
  onOpenChange,
  onOpenResult,
}: TimeblockSearchDialogProps) {
  const t = useTranslations();
  const locale = useLocale();
  const timezone = useUserPreferences((preferences) => preferences.timezone);
  const timeFormat = useUserPreferences((preferences) => preferences.timeFormat);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [setQueryAfterDelay, cancelDebounce] = useDebouncedCallback(
    setDebouncedQuery,
    SEARCH_DEBOUNCE_MS,
  );
  const wasOpenRef = useRef(open);
  const hasDebouncedQuery = debouncedQuery.length > 0;

  const searchInput = useMemo(
    () => ({
      search: debouncedQuery,
      sortBy: 'start_at' as const,
      sortOrder: 'desc' as const,
      limit: SEARCH_FETCH_LIMIT,
    }),
    [debouncedQuery],
  );

  const plansQuery = api.plans.list.useQuery(searchInput, {
    enabled: hasDebouncedQuery,
    // 閉じる・検索語変更でquery key（検索語）をmemory cacheにも残さない。
    gcTime: 0,
    meta: { persist: false },
  });
  const recordsQuery = api.records.list.useQuery(searchInput, {
    enabled: hasDebouncedQuery,
    gcTime: 0,
    meta: { persist: false },
  });
  const tagsQuery = useTags();
  const { data: tags } = tagsQuery;

  const tagsById = useMemo(
    () => new Map((tags ?? []).map((tag) => [tag.id, tag satisfies SearchTag])),
    [tags],
  );
  const merged = useMemo(
    () =>
      mergeTimeblockSearchResults(
        plansQuery.data ?? [],
        recordsQuery.data ?? [],
        SEARCH_DISPLAY_LIMIT,
      ),
    [plansQuery.data, recordsQuery.data],
  );
  const isDebouncing = query.trim().length > 0 && query.trim() !== debouncedQuery;
  const isLoading =
    isDebouncing ||
    (hasDebouncedQuery &&
      (plansQuery.isLoading ||
        recordsQuery.isLoading ||
        tagsQuery.isLoading ||
        plansQuery.isFetching ||
        recordsQuery.isFetching ||
        tagsQuery.isFetching));
  const isError =
    !isDebouncing &&
    hasDebouncedQuery &&
    (plansQuery.isError || recordsQuery.isError || tagsQuery.isError);

  const resetSearch = useCallback(() => {
    cancelDebounce();
    setQuery('');
    setDebouncedQuery('');
  }, [cancelDebounce]);

  const resetAndClose = useCallback(() => {
    resetSearch();
    onOpenChange(false);
  }, [onOpenChange, resetSearch]);

  // shellの排他制御など、controlled prop側から閉じられた場合も検索語を破棄する。
  useEffect(() => {
    if (wasOpenRef.current && !open) resetSearch();
    wasOpenRef.current = open;
  }, [open, resetSearch]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        onOpenChange(true);
        return;
      }
      resetAndClose();
    },
    [onOpenChange, resetAndClose],
  );

  const handleQueryChange = useCallback(
    (nextQuery: string) => {
      setQuery(nextQuery);
      const trimmedQuery = nextQuery.trim();
      if (trimmedQuery.length === 0) {
        cancelDebounce();
        setDebouncedQuery('');
        return;
      }
      setQueryAfterDelay(trimmedQuery);
    },
    [cancelDebounce, setQueryAfterDelay],
  );

  const handleOpenResult = useCallback(
    (result: TimeblockSearchResult) => {
      onOpenResult(result);
      resetAndClose();
    },
    [onOpenResult, resetAndClose],
  );

  const retry = useCallback(() => {
    void Promise.all([plansQuery.refetch(), recordsQuery.refetch(), tagsQuery.refetch()]);
  }, [plansQuery, recordsQuery, tagsQuery]);

  return (
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={t('calendar.search.title')}
      description={t('calendar.search.description')}
      className="sm:max-w-xl [&_[data-slot=dialog-close]]:top-2 [&_[data-slot=dialog-close]]:right-2"
    >
      <CommandInput
        value={query}
        onValueChange={handleQueryChange}
        placeholder={t('calendar.search.placeholder')}
        aria-label={t('calendar.search.inputLabel')}
        maxLength={200}
        autoFocus
        data-sentry-mask
      />
      <CommandList aria-busy={isLoading} data-sentry-block>
        <TimeblockSearchContent
          query={query}
          results={merged.results}
          tagsById={tagsById}
          isLoading={isLoading}
          isError={isError}
          hasMore={merged.hasMore}
          locale={locale}
          timezone={timezone}
          timeFormat={timeFormat}
          onOpenResult={handleOpenResult}
          onRetry={retry}
        />
      </CommandList>
    </CommandDialog>
  );
}
