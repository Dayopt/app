'use client';

import { getErrorMessage } from '@/lib/errors/normalize-error';
import {
  createStructuredError,
  ErrorCategory,
  ErrorLevel,
  logError,
} from '@/lib/errors/structured-error';
import { useCallback, useState } from 'react';

import { fetchSearchResults } from '../search-client';

export interface SearchResult {
  id: string;
  title: string;
  description: string;
  url: string;
  type: 'blog' | 'release' | 'docs';
  breadcrumbs: string[];
  lastModified: string;
}

export function useSearch() {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (query: string, locale: string) => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const results = await fetchSearchResults({ query, locale, operation: 'search_hook' });
      setResults(results);
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      const structuredError = createStructuredError(
        errorMessage,
        ErrorCategory.NETWORK,
        ErrorLevel.ERROR,
        'useSearch',
        err,
      );
      logError(structuredError);

      setError(errorMessage);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const clearResults = useCallback(() => {
    setResults([]);
    setError(null);
  }, []);

  return {
    results,
    loading,
    error,
    search,
    clearResults,
  };
}
