import { z } from 'zod';

import { captureUnexpectedWebError } from '@web/platform/observability/capture-unexpected-error';

const searchResponseSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      description: z.string(),
      url: z.string(),
      type: z.enum(['blog', 'docs']),
      breadcrumbs: z.array(z.string()).default([]),
      lastModified: z.string(),
      category: z.string().optional(),
    }),
  ),
});

interface FetchSearchResultsOptions {
  query: string;
  locale: string;
  operation: 'search_dialog_preview' | 'search_page' | 'search_hook';
  signal?: AbortSignal;
}

class SearchResponseError extends Error {
  constructor() {
    super('Search API rejected the request');
    this.name = 'SearchResponseError';
  }
}

function isExplicitCancellation(error: unknown, signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true && signal.reason === error && error instanceof Error;
}

/** Fetch and validate search results without ever attaching the search term to telemetry. */
export async function fetchSearchResults({
  query,
  locale,
  operation,
  signal,
}: FetchSearchResultsOptions) {
  try {
    const response = await fetch(
      `/api/search?q=${encodeURIComponent(query)}&locale=${encodeURIComponent(locale)}`,
      { signal },
    );
    if (!response.ok) throw new SearchResponseError();

    const payload: unknown = await response.json();
    const parsed = searchResponseSchema.safeParse(payload);
    if (!parsed.success) throw new Error('Search API returned an invalid response');
    return parsed.data.results;
  } catch (error) {
    // Every HTTP response belongs to the server observability boundary. Only a caller-owned
    // AbortController cancellation is expected on the browser side.
    if (error instanceof SearchResponseError || isExplicitCancellation(error, signal)) throw error;
    throw captureUnexpectedWebError(error, {
      feature: 'search',
      operation,
      route: '/api/search',
      source: 'search_api',
    });
  }
}
