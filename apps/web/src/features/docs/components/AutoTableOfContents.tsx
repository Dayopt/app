'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { TocItem, generateTableOfContents, truncateHeading } from '../lib/toc';

interface AutoTableOfContentsProps {
  content: string;
  className?: string;
}

interface TocListProps {
  items: TocItem[];
  level?: number;
  activeId: string;
  onItemClick: (id: string) => void;
}

function TocList({ items, level = 0, activeId, onItemClick }: TocListProps) {
  return (
    <ul className={`space-y-1 ${level > 0 ? 'ml-4' : ''}`}>
      {items.map((item) => (
        <li key={item.id}>
          <button
            onClick={() => onItemClick(item.id)}
            className={`-ml-2 block w-full rounded-lg px-2 py-2 text-left text-sm transition-colors ${
              activeId === item.id
                ? 'text-foreground bg-state-selected font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-state-hover'
            }`}
            title={item.title}
          >
            <span className="line-clamp-2">
              {truncateHeading(item.title, level === 0 ? 40 : 35)}
            </span>
          </button>
          {item.children && item.children.length > 0 && (
            <TocList
              items={item.children}
              level={level + 1}
              activeId={activeId}
              onItemClick={onItemClick}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

export function AutoTableOfContents({ content, className = '' }: AutoTableOfContentsProps) {
  const t = useTranslations('docs.toc');
  const [toc, setToc] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [isLoaded, setIsLoaded] = useState(false);

  // コンテンツから目次を生成
  useEffect(() => {
    try {
      const tocItems = generateTableOfContents(content);
      setToc(tocItems);
      setIsLoaded(true);
    } catch {
      setIsLoaded(true);
    }
  }, [content]);

  // アクティブな見出しを追跡
  useEffect(() => {
    if (toc.length === 0) return;

    const flatTocItems = flattenTocItems(toc);
    const headingIds = flatTocItems.map((item) => item.id).filter(Boolean);

    const updateActiveHeading = () => {
      const mainElement = document.getElementById('main-content');
      const scrollTop = mainElement?.scrollTop ?? window.scrollY;
      const offset = 100; // ヘッダー高さを考慮

      let currentActiveId = '';

      // スクロール位置より上にある最後の見出しを探す
      for (const id of headingIds) {
        const element = document.getElementById(id);
        if (!element) continue;

        const elementTop = mainElement
          ? element.offsetTop - mainElement.offsetTop
          : element.getBoundingClientRect().top + window.scrollY;

        if (elementTop <= scrollTop + offset) {
          currentActiveId = id;
        } else {
          break;
        }
      }

      setActiveId(currentActiveId);
    };

    // 初期設定
    setTimeout(updateActiveHeading, 100);

    // main要素のスクロールを監視
    const mainElement = document.getElementById('main-content');
    if (mainElement) {
      mainElement.addEventListener('scroll', updateActiveHeading, { passive: true });
    }
    window.addEventListener('scroll', updateActiveHeading, { passive: true });

    return () => {
      if (mainElement) {
        mainElement.removeEventListener('scroll', updateActiveHeading);
      }
      window.removeEventListener('scroll', updateActiveHeading);
    };
  }, [toc]);

  // スムーズスクロール
  const handleItemClick = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      const mainElement = document.getElementById('main-content');
      const headerOffset = 32; // py-8のパディング分

      if (mainElement) {
        // main要素内でスクロール
        const elementPosition = element.offsetTop - headerOffset;
        mainElement.scrollTo({
          top: elementPosition,
          behavior: 'smooth',
        });
      } else {
        // フォールバック: window スクロール
        const elementPosition = element.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth',
        });
      }

      // URLハッシュを更新（履歴には追加しない）
      if (history.replaceState) {
        history.replaceState(null, '', `#${id}`);
      }
    }
  };

  // 目次が空の場合は非表示
  if (!isLoaded || toc.length === 0) {
    return (
      <div className={`space-y-4 ${className}`}>
        <div className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
          {t('onThisPage')}
        </div>
        {!isLoaded ? (
          <div className="text-muted-foreground text-sm">{t('loading')}</div>
        ) : (
          <div className="text-muted-foreground text-sm">{t('noHeadings')}</div>
        )}
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
        {t('onThisPage')}
      </div>

      <nav className="space-y-1">
        <TocList items={toc} activeId={activeId} onItemClick={handleItemClick} />
      </nav>

      {/* Links */}
      <div className="border-border border-t pt-4">
        <div className="text-muted-foreground mb-4 text-xs font-medium tracking-wider uppercase">
          {t('links')}
        </div>
        <ul className="space-y-2">
          <li>
            <a
              href="https://github.com/dayopt/dayopt-web/issues/new"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground text-sm transition-colors"
            >
              {t('reportIssue')}
            </a>
          </li>
          <li>
            <a
              href="https://github.com/dayopt/dayopt-web"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground text-sm transition-colors"
            >
              {t('viewSource')}
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
}

// 階層化された目次をフラットなリストに変換
function flattenTocItems(items: TocItem[]): TocItem[] {
  const flattened: TocItem[] = [];

  for (const item of items) {
    flattened.push(item);
    if (item.children) {
      flattened.push(...flattenTocItems(item.children));
    }
  }

  return flattened;
}
