import { apiError, ErrorCode } from '@/platform/api/api-response';
import { getClientIp, searchRateLimit } from '@/platform/security/rate-limit';
import fs from 'fs';
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';

interface SearchIndexEntry {
  id: string;
  title: string;
  description: string;
  url: string;
  type: 'blog' | 'docs' | 'release';
  tags: string[];
  category: string;
  date: string;
}

// ビルド時に生成された検索インデックスをキャッシュ
let indexCache: Record<string, SearchIndexEntry[]> | null = null;

function loadSearchIndex(): Record<string, SearchIndexEntry[]> {
  if (indexCache) return indexCache;

  const indexPath = path.join(process.cwd(), 'public', 'search-index.json');

  if (!fs.existsSync(indexPath)) {
    console.warn('[Search API] search-index.json not found. Run `npm run generate:search-index`.');
    return {};
  }

  try {
    const raw = fs.readFileSync(indexPath, 'utf-8');
    indexCache = JSON.parse(raw) as Record<string, SearchIndexEntry[]>;
    return indexCache;
  } catch (err) {
    console.error('[Search API] Failed to load search-index.json:', err);
    return {};
  }
}

function getBreadcrumbs(entry: SearchIndexEntry): string[] {
  switch (entry.type) {
    case 'blog':
      return ['Blog', entry.category || 'Uncategorized'];
    case 'release':
      return ['Releases', entry.id];
    case 'docs':
      return ['Documentation', entry.category || 'Uncategorized'];
    default:
      return [];
  }
}

export async function GET(request: NextRequest) {
  try {
    // レート制限チェック
    const ip = getClientIp(request);
    const { success } = await searchRateLimit.limit(ip);

    if (!success) {
      return apiError('Too many requests. Please try again later.', 429, {
        code: ErrorCode.RATE_LIMIT_EXCEEDED,
      });
    }

    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q');

    if (!query || query.trim().length === 0) {
      return NextResponse.json({ results: [] });
    }

    // Validate query length to prevent DoS
    if (query.length > 200) {
      return apiError('Search query too long', 400, { code: ErrorCode.QUERY_TOO_LONG });
    }

    const locale = searchParams.get('locale') || 'en';

    // ビルド時に生成された静的インデックスを使用
    const index = loadSearchIndex();
    const entries = index[locale] || [];

    const searchTerm = query.toLowerCase();
    const results = [];

    for (const entry of entries) {
      const titleMatch = entry.title.toLowerCase().includes(searchTerm);
      const descriptionMatch = entry.description.toLowerCase().includes(searchTerm);
      const tagMatch = entry.tags.some((tag) => tag.toLowerCase().includes(searchTerm));

      if (titleMatch || descriptionMatch || tagMatch) {
        results.push({
          id: entry.id,
          title: entry.title,
          description: entry.description,
          url: entry.url,
          type: entry.type,
          breadcrumbs: getBreadcrumbs(entry),
          lastModified: entry.date,
          tags: entry.tags,
        });
      }
    }

    // Sort by relevance (prioritize title matches)
    results.sort((a, b) => {
      const aTitleMatch = a.title.toLowerCase().includes(searchTerm);
      const bTitleMatch = b.title.toLowerCase().includes(searchTerm);

      if (aTitleMatch && !bTitleMatch) return -1;
      if (!aTitleMatch && bTitleMatch) return 1;

      return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime();
    });

    return NextResponse.json({ results: results.slice(0, 50) });
  } catch {
    return apiError('Search failed', 500, { code: ErrorCode.INTERNAL_ERROR });
  }
}
