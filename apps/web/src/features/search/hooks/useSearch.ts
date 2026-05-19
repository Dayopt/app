'use client';

import {
  createStructuredError,
  ErrorCategory,
  ErrorLevel,
  getErrorMessage,
  logError,
} from '@/lib/error-utils';
import { useCallback, useState } from 'react';

export interface SearchResult {
  id: string;
  title: string;
  description: string;
  url: string;
  type: 'blog' | 'release' | 'docs';
  breadcrumbs: string[];
  lastModified: string;
  tags: string[];
}

export function useSearch() {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (query: string) => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      if (!response.ok) {
        throw new Error(`Search failed with status: ${response.status}`);
      }

      const data = await response.json();
      setResults(data.results || []);
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
