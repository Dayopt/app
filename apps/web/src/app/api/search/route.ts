import {
  createSearchIndex,
  searchEntries,
  type SearchIndexEntry,
} from '@web/features/search/lib/search-index';
import { apiError, ErrorCode } from '@web/platform/api/api-response';
import { captureUnexpectedWebError } from '@web/platform/observability/capture-unexpected-error';
import { resolveTechnicalRequestId } from '@web/platform/observability/technical-error-context';
import {
  getClientIp,
  hashRateLimitIdentifier,
  searchRateLimit,
} from '@web/platform/security/rate-limit';
import fs from 'fs';
import type MiniSearch from 'minisearch';
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';

// ビルド時に生成されたインデックスから構築した MiniSearch を locale ごとにキャッシュする
const indexCache = new Map<string, MiniSearch<SearchIndexEntry>>();
let rawIndexCache: Record<string, SearchIndexEntry[]> | null = null;

function loadRawIndex(): Record<string, SearchIndexEntry[]> {
  if (rawIndexCache) return rawIndexCache;

  const indexPath = path.join(process.cwd(), 'public', 'search-index.json');

  const raw = fs.readFileSync(indexPath, 'utf-8');
  rawIndexCache = JSON.parse(raw) as Record<string, SearchIndexEntry[]>;
  return rawIndexCache;
}

function getSearchIndex(locale: string): MiniSearch<SearchIndexEntry> {
  const cached = indexCache.get(locale);
  if (cached) return cached;

  const entries = loadRawIndex()[locale] ?? [];
  const index = createSearchIndex(entries);
  indexCache.set(locale, index);
  return index;
}

function getBreadcrumbs(type: string, category: string): string[] {
  switch (type) {
    case 'blog':
      return ['Blog', category || 'Uncategorized'];
    case 'docs':
      return ['Documentation', category || 'Uncategorized'];
    default:
      return [];
  }
}

export async function GET(request: NextRequest) {
  const requestId = resolveTechnicalRequestId(request.headers);
  const requestContext = requestId ? { requestId } : {};
  let rateLimitResult: Awaited<ReturnType<typeof searchRateLimit.limit>>;
  try {
    const ip = getClientIp(request);
    rateLimitResult = await searchRateLimit.limit(await hashRateLimitIdentifier(ip));
  } catch (error) {
    captureUnexpectedWebError(error, {
      feature: 'search',
      operation: 'rate_limit',
      route: '/api/search',
      ...requestContext,
    });
    return apiError('Search temporarily unavailable', 503, {
      code: ErrorCode.EXTERNAL_SERVICE_ERROR,
    });
  }

  if (!rateLimitResult.success) {
    return apiError('Too many requests. Please try again later.', 429, {
      code: ErrorCode.RATE_LIMIT_EXCEEDED,
    });
  }

  try {
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

    // ビルド時に生成された静的インデックスから全文検索する（MiniSearch、スコア順）
    const results = searchEntries(getSearchIndex(locale), query).map((hit) => ({
      id: hit.id as string,
      title: hit.title as string,
      description: hit.description as string,
      url: hit.url as string,
      type: hit.type as SearchIndexEntry['type'],
      breadcrumbs: getBreadcrumbs(hit.type as string, hit.category as string),
      lastModified: hit.date as string,
    }));

    return NextResponse.json({ results });
  } catch (error) {
    captureUnexpectedWebError(error, {
      feature: 'search',
      operation: 'search_request',
      route: '/api/search',
      ...requestContext,
    });
    return apiError('Search failed', 500, { code: ErrorCode.INTERNAL_ERROR });
  }
}
