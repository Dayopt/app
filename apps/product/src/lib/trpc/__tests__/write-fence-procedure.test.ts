import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it } from 'vitest';

import { resetWriteFenceCacheForTestsOnly } from '@/lib/ops/write-fence';
import { createChainableMock, createMockContext } from '@/lib/test/trpc-test-helpers';

import { createCallerFactory, createTRPCRouter, protectedProcedure } from '../procedures';

const testRouter = createTRPCRouter({
  ping: protectedProcedure.query(() => 'pong'),
  write: protectedProcedure.mutation(() => 'written'),
});

const createCaller = createCallerFactory(testRouter);

function contextWithFence(fenceEnabled: boolean) {
  return createMockContext({
    userId: 'test-user-id',
    supabaseOverrides: {
      from: ((table: string) => {
        if (table === 'write_fence_control') {
          return createChainableMock({ fence_enabled: fenceEnabled });
        }
        return createChainableMock(null);
      }) as never,
    },
  });
}

describe('protectedProcedure write fence', () => {
  beforeEach(() => {
    resetWriteFenceCacheForTestsOnly();
  });

  it('fence 有効時、mutation は SERVICE_UNAVAILABLE で拒否される', async () => {
    const caller = createCaller(contextWithFence(true));

    await expect(caller.write()).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    } satisfies Partial<TRPCError>);
  });

  it('fence 有効時でも、query は通る', async () => {
    const caller = createCaller(contextWithFence(true));

    await expect(caller.ping()).resolves.toBe('pong');
  });

  it('fence 無効時、mutation は通る', async () => {
    const caller = createCaller(contextWithFence(false));

    await expect(caller.write()).resolves.toBe('written');
  });
});
