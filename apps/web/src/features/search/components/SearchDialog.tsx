'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { TagPill } from '@/components/ui/tag-pill';
import { Highlight } from '@/lib/highlight';
import type { PopularTag, SearchResponse, TagResponse } from '@/types/api';
import { Clock, Edit, FileText, Package, Search, Tag, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

interface SearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: string;
}

interface QuickLinkConfig {
  key: 'quickStart' | 'apiReference' | 'latestRelease' | 'saasStrategy';
  href: string;
  type: string;
}

const QUICK_LINK_CONFIGS: QuickLinkConfig[] = [
  { key: 'quickStart', href: '/docs/quick-start', type: 'docs' },
  { key: 'apiReference', href: '/docs/api-reference', type: 'docs' },
  { key: 'latestRelease', href: '/releases/v2.1.0', type: 'release' },
  { key: 'saasStrategy', href: '/blog/saas-strategy-2024', type: 'blog' },
];

export function SearchDialog({ open, onOpenChange, locale }: SearchDialogProps) {
  const t = useTranslations('search');
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [popularTags, setPopularTags] = useState<PopularTag[]>([]);
  const [previewResults, setPreviewResults] = useState<SearchResponse['results']>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  // クイックリンクを翻訳から生成（メモ化）
  const QUICK_LINKS = useMemo(
    () =>
      QUICK_LINK_CONFIGS.map((config) => ({
        title: t(`quickLinks.${config.key}.title`),
        description: t(`quickLinks.${config.key}.description`),
        href: `/${locale}${config.href}`,
        type: config.type,
      })),
    [t, locale],
  );

  // タグフィルタリング（メモ化）
  const matchedTags = useMemo(() => {
    if (!query) return [];
    const normalizedQuery = query.toLowerCase();
    return popularTags.filter((tag) => tag.name.toLowerCase().includes(normalizedQuery));
  }, [popularTags, query]);

  // localStorage から最近の検索を読み込む
  useEffect(() => {
    try {
      const stored = localStorage.getItem('recent-searches');
      if (stored) {
        const searches: string[] = JSON.parse(stored);
        setRecentSearches(searches.slice(0, 5)); // 最大5件
      }
    } catch (error) {
      console.error('[SearchDialog] Failed to load recent searches:', error);
      setRecentSearches([]);
    }
  }, []);

  // 検索を履歴に追加
  const addToRecentSearches = (searchQuery: string) => {
    if (!searchQuery.trim()) return;

    try {
      // 重複を削除して最新を先頭に追加
      const updated = [searchQuery, ...recentSearches.filter((s) => s !== searchQuery)].slice(0, 5);
      localStorage.setItem('recent-searches', JSON.stringify(updated));
      setRecentSearches(updated);
    } catch (error) {
      console.error('[SearchDialog] Failed to save recent search:', error);
    }
  };

  // 人気タグを取得
  useEffect(() => {
    let isMounted = true;
    const abortController = new AbortController();

    const fetchPopularTags = async () => {
      try {
        const response = await fetch('/api/tags', {
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error('Failed to fetch tags');
        }

        const allTags: TagResponse[] = await response.json();

        if (isMounted) {
          const topTags: PopularTag[] = allTags.slice(0, 8).map((tag) => ({
            name: tag.tag,
            count: tag.count,
          }));
          setPopularTags(topTags);
        }
      } catch (error) {
        if (error instanceof Error && error.name !== 'AbortError') {
          console.error('[SearchDialog] Failed to fetch popular tags:', error);
        }
      }
    };

    fetchPopularTags();

    return () => {
      isMounted = false;
      abortController.abort();
    };
  }, []);

  // 検索プレビューを取得
  useEffect(() => {
    if (query.length <= 2) {
      setPreviewResults([]);
      return;
    }

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(query)}&locale=${encodeURIComponent(locale)}`, {
        signal: abortController.signal,
      })
        .then((response) => response.json())
        .then((data: SearchResponse) => {
          setPreviewResults((data.results || []).slice(0, 3));
        })
        .catch((error) => {
          if (error instanceof Error && error.name !== 'AbortError') {
            setPreviewResults([]);
          }
        });
    }, 300); // 300ms debounce

    return () => {
      clearTimeout(timeoutId);
      abortController.abort();
    };
  }, [query, locale]);

  useEffect(() => {
    if (open) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    } else {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [open]);

  const handleSearch = (searchQuery: string) => {
    if (!searchQuery.trim()) return;

    // 検索履歴に追加
    addToRecentSearches(searchQuery);

    onOpenChange(false);
    router.push(`/${locale}/search?q=${encodeURIComponent(searchQuery)}`);
  };

  const handleTagClick = (tagName: string) => {
    onOpenChange(false);
    router.push(`/${locale}/tags/${encodeURIComponent(tagName.toLowerCase())}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onOpenChange(false);
      return;
    }

    if (e.key === 'Enter') {
      if (query.trim()) {
        handleSearch(query);
      } else if (QUICK_LINKS[selectedIndex]) {
        onOpenChange(false);
        router.push(QUICK_LINKS[selectedIndex].href);
      }
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, QUICK_LINKS.length - 1));
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'docs':
        return <FileText className="text-info size-4" />;
      case 'blog':
        return <Edit className="text-success size-4" />;
      case 'release':
        return <Package className="text-primary size-4" />;
      default:
        return <FileText className="text-muted-foreground size-4" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border max-w-2xl gap-0 overflow-hidden p-0 shadow-2xl [&>button]:hidden">
        {/* 検索ヘッダー */}
        <div className="border-border flex items-center gap-4 border-b p-4">
          <Search className="text-muted-foreground size-5 flex-shrink-0" />
          <Input
            ref={inputRef}
            placeholder={t('placeholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="text-foreground placeholder:text-muted-foreground flex-1 border-0 bg-transparent text-base shadow-none focus:outline-none focus-visible:ring-0"
          />
          <Button
            onClick={() => onOpenChange(false)}
            variant="ghost"
            icon
            aria-label={t('close')}
            className="size-5 flex-shrink-0"
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>

        {/* 検索内容 */}
        <div className="max-h-96 overflow-y-auto">
          {!query ? (
            <div className="space-y-6 p-4">
              {/* 最近の検索 */}
              {recentSearches.length > 0 && (
                <div>
                  <h3 className="text-muted-foreground mb-4 text-xs font-medium tracking-wide uppercase">
                    {t('recentSearches')}
                  </h3>
                  <div className="space-y-1">
                    {recentSearches.map((search, index) => (
                      <Button
                        key={index}
                        onClick={() => setQuery(search)}
                        variant="ghost"
                        className="flex h-auto w-full items-center justify-start gap-4 p-2"
                      >
                        <Clock className="text-muted-foreground size-4" />
                        <span className="text-sm">{search}</span>
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {/* 人気タグ */}
              <div>
                <h3 className="text-muted-foreground mb-4 text-xs font-medium tracking-wide uppercase">
                  {t('popularTags')}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {popularTags.map((tag, index) => (
                    <TagPill
                      key={index}
                      tag={tag.name}
                      count={tag.count}
                      onClick={() => handleTagClick(tag.name)}
                    />
                  ))}
                </div>
              </div>

              {/* クイックリンク */}
              <div>
                <h3 className="text-muted-foreground mb-4 text-xs font-medium tracking-wide uppercase">
                  {t('popularPages')}
                </h3>
                <div className="space-y-1">
                  {QUICK_LINKS.map((link, index) => (
                    <Button
                      key={index}
                      onClick={() => {
                        onOpenChange(false);
                        router.push(link.href);
                      }}
                      variant="ghost"
                      className={`flex h-auto w-full items-start justify-start gap-4 p-4 ${
                        selectedIndex === index ? 'bg-state-active border-primary border' : ''
                      }`}
                    >
                      <div className="mt-1">{getTypeIcon(link.type)}</div>
                      <div className="min-w-0 flex-1">
                        <div className="text-foreground truncate text-sm font-medium">
                          {link.title}
                        </div>
                        <div className="text-muted-foreground mt-1 text-xs">{link.description}</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Badge variant="outline" className="px-2 py-1 text-xs">
                          {link.type === 'docs'
                            ? t('docs')
                            : link.type === 'blog'
                              ? t('blog')
                              : t('release')}
                        </Badge>
                      </div>
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 p-4">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-muted-foreground text-sm">
                  {t('searchResultsFor')} &ldquo;
                  <span className="font-medium">{query}</span>&rdquo;
                </p>
                <Badge variant="outline" className="text-xs">
                  {t('pressEnterToSearch')}
                </Badge>
              </div>

              {/* 全文検索 */}
              <Button
                onClick={() => handleSearch(query)}
                variant="ghost"
                className="bg-state-active border-primary hover:bg-state-hover flex h-auto w-full items-center justify-start gap-4 border p-4"
              >
                <Search className="text-primary size-4" />
                <div className="text-left">
                  <div className="text-foreground text-sm font-medium">
                    {t('searchFor')} &ldquo;
                    <Highlight text={query} query={query} />
                    &rdquo;
                  </div>
                  <div className="text-muted-foreground text-xs">{t('findResultsAcross')}</div>
                </div>
              </Button>

              {/* プレビュー検索結果 */}
              {previewResults.length > 0 && (
                <div>
                  <p className="text-muted-foreground mb-2 text-xs">{t('previewResults')}</p>
                  <div className="space-y-2">
                    {previewResults.map((result, index) => (
                      <Button
                        key={index}
                        onClick={() => {
                          onOpenChange(false);
                          router.push(result.url);
                        }}
                        variant="ghost"
                        className="border-border flex h-auto w-full items-start justify-start gap-4 border p-4"
                      >
                        <div className="mt-1">{getTypeIcon(result.type)}</div>
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex items-center gap-2">
                            <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                              {result.breadcrumbs?.[0] ||
                                (result.type === 'docs'
                                  ? t('docs')
                                  : result.type === 'blog'
                                    ? t('blog')
                                    : result.type === 'tags'
                                      ? t('tags')
                                      : t('release'))}
                            </span>
                            <span className="text-muted-foreground/50 text-xs">•</span>
                            <span className="text-muted-foreground text-xs">
                              {result.breadcrumbs?.[1] || result.category || 'General'}
                            </span>
                          </div>
                          <div className="text-foreground truncate text-sm font-medium">
                            <Highlight text={result.title} query={query} />
                          </div>
                          <div className="text-muted-foreground mt-1 line-clamp-2 text-xs">
                            <Highlight text={result.description} query={query} />
                          </div>
                        </div>
                        <Badge variant="outline" className="self-start px-2 py-1 text-xs">
                          {result.type === 'docs'
                            ? t('docs')
                            : result.type === 'blog'
                              ? t('blog')
                              : result.type === 'tags'
                                ? t('tags')
                                : t('release')}
                        </Badge>
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {/* タグ検索候補 */}
              {matchedTags.length > 0 && (
                <div>
                  <p className="text-muted-foreground mb-2 text-xs">{t('relatedTags')}</p>
                  <div className="space-y-1">
                    {matchedTags.map((tag, index) => (
                      <Button
                        key={index}
                        onClick={() => handleTagClick(tag.name)}
                        variant="ghost"
                        className="flex h-auto w-full items-center justify-start gap-4 p-2"
                      >
                        <div className="mt-1">
                          <Tag className="text-muted-foreground size-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex items-center gap-2">
                            <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                              {t('tags')}
                            </span>
                            <span className="text-muted-foreground/50 text-xs">•</span>
                            <span className="text-muted-foreground text-xs">
                              {tag.count} {t('articles')}
                            </span>
                          </div>
                          <div className="text-foreground truncate text-sm font-medium">
                            <Highlight text={tag.name} query={query} />
                          </div>
                        </div>
                        <Badge variant="outline" className="self-start px-2 py-1 text-xs">
                          {t('tags')}
                        </Badge>
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="bg-container text-muted-foreground border-border border-t p-4 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                <kbd className="bg-muted border-border text-foreground rounded border px-2 py-1 font-mono text-xs">
                  Enter
                </kbd>
                <span>{t('toSelect')}</span>
              </div>
              <div className="flex items-center gap-1">
                <kbd className="bg-muted border-border text-foreground rounded border px-2 py-1 font-mono text-xs">
                  ↑↓
                </kbd>
                <span>{t('toNavigate')}</span>
              </div>
              <div className="flex items-center gap-1">
                <kbd className="bg-muted border-border text-foreground rounded border px-2 py-1 font-mono text-xs">
                  Esc
                </kbd>
                <span>{t('toClose')}</span>
              </div>
            </div>
            <span className="text-muted-foreground/70">{t('poweredBy')}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
