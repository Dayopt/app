'use client';

import { useCallback, useMemo, useState } from 'react';

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useEntries, useEntryInspectorStore } from '@/features/entry';
import { TagIcon, useTags } from '@/features/tags';
import { formatDateShort, formatTimeRange } from '@/lib/date/format';
import { useCalendarFilterStore } from '@/stores/useCalendarFilterStore';
import { useCalendarNavigationStore } from '@/stores/useCalendarNavigationStore';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { useTranslations } from 'next-intl';

import { HighlightedText } from '../lib/highlight-text';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** コロン記法タグ名を › セパレーター表示しつつ検索ハイライトを適用 */
function HighlightedTagName({ name, query }: { name: string; query: string }) {
  const colonIdx = name.indexOf(':');
  if (colonIdx === -1) return <HighlightedText text={name} query={query} />;
  const prefix = name.slice(0, colonIdx);
  const suffix = name.slice(colonIdx + 1);
  return (
    <>
      <span className="text-muted-foreground">
        <HighlightedText text={prefix} query={query} />
      </span>
      <span className="text-muted-foreground mx-1">›</span>
      <HighlightedText text={suffix} query={query} />
    </>
  );
}

/** グローバル検索モーダル（タグ検索 + エントリ検索、Cmd/Ctrl+K で開閉） */
export function GlobalSearchModal({ isOpen, onClose }: GlobalSearchModalProps) {
  const t = useTranslations('common.search');
  const [query, setQuery] = useState('');

  // Data - only fetch when modal is open
  const { data: entries = [] } = useEntries(undefined, { enabled: isOpen });
  const { data: tags = [] } = useTags();

  // Actions
  const openInspector = useEntryInspectorStore((s) => s.openInspector);
  const showOnlyTag = useCalendarFilterStore((s) => s.showOnlyTag);
  const navigateTo = useCalendarNavigationStore((s) => s.navigateTo);

  // Reset query when modal closes
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (prevIsOpen && !isOpen) {
    setPrevIsOpen(isOpen);
    setQuery('');
  } else if (prevIsOpen !== isOpen) {
    setPrevIsOpen(isOpen);
  }

  // Filter tags by query
  const filteredTags = useMemo(() => {
    if (!query.trim()) return tags;
    const q = query.toLowerCase();
    return tags.filter((tag) => tag.name.toLowerCase().includes(q));
  }, [tags, query]);

  // Filter entries by query (search description and resolved tag name)
  const filteredEntries = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();

    return entries
      .filter((entry) => {
        // Match description
        if (entry.description?.toLowerCase().includes(q)) return true;
        // Match tag name
        if (entry.tagId) {
          const tag = tags.find((t) => t.id === entry.tagId);
          if (tag?.name.toLowerCase().includes(q)) return true;
        }
        return false;
      })
      .sort((a, b) => {
        // Sort by start_time descending (newest first)
        const aTime = a.start_time ? new Date(a.start_time).getTime() : 0;
        const bTime = b.start_time ? new Date(b.start_time).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 20);
  }, [entries, tags, query]);

  // Handle tag selection → showOnlyTag + close
  const handleTagSelect = useCallback(
    (tagId: string) => {
      showOnlyTag(tagId);
      onClose();
    },
    [showOnlyTag, onClose],
  );

  // Handle entry selection → navigate to date + open inspector
  const handleEntrySelect = useCallback(
    (entryId: string, startTime: string | null) => {
      onClose();
      if (startTime) {
        navigateTo(new Date(startTime));
      }
      openInspector(entryId);
    },
    [onClose, navigateTo, openInspector],
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      {/* eslint-disable-next-line tailwindcss/no-arbitrary-value -- viewport unit */}
      <DialogContent className="w-[95vw] max-w-2xl overflow-hidden p-0" showCloseButton={false}>
        <VisuallyHidden>
          <DialogTitle>{t('title')}</DialogTitle>
        </VisuallyHidden>
        <Command className="[&_[cmdk-group-heading]]:text-muted-foreground !rounded-none [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-normal [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-2">
          <div className="relative">
            <CommandInput placeholder={t('placeholder')} value={query} onValueChange={setQuery} />
            <div className="absolute top-1/2 right-4 hidden -translate-y-1/2 items-center gap-1 md:flex">
              <kbd className="bg-surface-container text-muted-foreground inline-flex h-6 items-center gap-1 rounded-lg border px-2 font-mono text-xs font-normal opacity-100 select-none">
                ESC
              </kbd>
            </div>
          </div>
          <CommandList className="max-h-120">
            <CommandEmpty>{t('noResults')}</CommandEmpty>

            {/* Tags */}
            {filteredTags.length > 0 && (
              <CommandGroup heading={t('tagsGroup')}>
                {filteredTags.map((tag) => (
                  <CommandItem
                    key={`tag-${tag.id}`}
                    value={tag.name}
                    onSelect={() => handleTagSelect(tag.id)}
                    className="flex items-center gap-2"
                  >
                    <TagIcon icon={tag.icon} color={tag.color} size="sm" className="shrink-0" />
                    <span className="truncate">
                      <HighlightedTagName name={tag.name} query={query} />
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {/* Entries (only when searching) */}
            {filteredEntries.length > 0 && (
              <CommandGroup heading={t('blocksGroup')}>
                {filteredEntries.map((entry) => {
                  const tag = entry.tagId ? tags.find((t) => t.id === entry.tagId) : null;
                  const startDate = entry.start_time ? new Date(entry.start_time) : null;
                  const endDate = entry.end_time ? new Date(entry.end_time) : null;

                  return (
                    <CommandItem
                      key={`entry-${entry.id}`}
                      value={`${entry.id} ${tag?.name ?? ''} ${entry.description ?? ''}`}
                      onSelect={() => handleEntrySelect(entry.id, entry.start_time)}
                      className="flex items-center gap-2"
                    >
                      <TagIcon icon={tag?.icon} color={tag?.color} size="sm" className="shrink-0" />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <div className="text-muted-foreground flex items-center gap-1 text-xs">
                          {tag && (
                            <span className="truncate">
                              <HighlightedTagName name={tag.name} query={query} />
                            </span>
                          )}
                          {startDate && (
                            <>
                              <span>{formatDateShort(startDate)}</span>
                              {endDate && <span>{formatTimeRange(startDate, endDate)}</span>}
                            </>
                          )}
                        </div>
                        {entry.description && (
                          <span className="truncate text-sm">
                            <HighlightedText text={entry.description} query={query} />
                          </span>
                        )}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
