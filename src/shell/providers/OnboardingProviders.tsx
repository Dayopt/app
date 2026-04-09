/**
 * オンボーディングページ用Providers
 *
 * フルProvidersの軽量版。tRPC + Auth + Theme のみ提供。
 * GlobalSearchProvider, ServiceWorkerProvider は不要。
 *
 * @see src/shell/providers.tsx - フルProviders定義
 */
'use client';

import { useState } from 'react';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink, loggerLink, TRPCClientError } from '@trpc/client';
import superjson from 'superjson';

import { Toaster } from '@/components/ui/toast';
import { AuthStoreInitializer } from '@/features/auth';
import { api, getBaseUrl } from '@/platform/trpc';
import { ThemeProvider } from '@/shell/providers/theme-provider';

function isAuthError(error: unknown): boolean {
  if (error instanceof TRPCClientError) {
    const code = error.data?.code;
    if (code === 'UNAUTHORIZED') return true;
    const httpStatus = error.data?.httpStatus;
    if (httpStatus === 401) return true;
  }
  return false;
}

function handleAuthError(error: unknown): void {
  if (typeof window === 'undefined') return;
  if (isAuthError(error)) {
    const currentPath = window.location.pathname + window.location.search;
    const loginUrl = `/auth/login?redirect=${encodeURIComponent(currentPath)}`;
    window.location.href = loginUrl;
  }
}

interface OnboardingProvidersProps {
  children: React.ReactNode;
}

/** オンボーディングページ用の軽量Providers（tRPC + Auth + Theme のみ提供） */
export function OnboardingProviders({ children }: OnboardingProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error) => handleAuthError(error),
        }),
        mutationCache: new MutationCache({
          onError: (error) => handleAuthError(error),
        }),
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,
            gcTime: 10 * 60 * 1000,
            retry: (failureCount, error) => {
              if (isAuthError(error)) return false;
              return failureCount < 3;
            },
          },
        },
      }),
  );

  const [trpcClient] = useState(() =>
    api.createClient({
      links: [
        loggerLink({
          enabled: (opts) => opts.direction === 'down' && opts.result instanceof Error,
        }),
        httpBatchLink({
          url: `${getBaseUrl()}/api/trpc`,
          transformer: superjson,
          headers() {
            const headers: Record<string, string> = {};
            if (typeof window !== 'undefined') {
              const token = localStorage.getItem('auth_token');
              if (token) {
                headers.authorization = `Bearer ${token}`;
              }
            }
            return headers;
          },
        }),
      ],
    }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <api.Provider client={trpcClient} queryClient={queryClient}>
        <AuthStoreInitializer />
        <ThemeProvider>{children}</ThemeProvider>
      </api.Provider>
      <Toaster />
    </QueryClientProvider>
  );
}
