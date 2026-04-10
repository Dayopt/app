import { fetchRequestHandler } from '@trpc/server/adapters/fetch';

import { logger } from '@/lib/logger';
import { createFetchTRPCContext } from '@/lib/trpc/procedures';
import { appRouter } from '@/lib/trpc/root';

export const runtime = 'nodejs';

function handler(req: Request) {
  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: createFetchTRPCContext,
    onError: ({ error, type, path, input, ctx }) => {
      logger.error('tRPC Error:', {
        type,
        path,
        error: error.message,
        code: error.code,
        input: process.env.NODE_ENV === 'development' ? input : '[REDACTED]',
        userId: ctx?.userId,
        timestamp: new Date().toISOString(),
      });
    },
    responseMeta: ({ ctx }) => {
      const isAuthenticated = !!ctx?.userId;

      return {
        headers: {
          'cache-control': isAuthenticated ? 'private, no-store' : 'no-cache',
        },
      };
    },
  });
}

export { handler as GET, handler as POST };
