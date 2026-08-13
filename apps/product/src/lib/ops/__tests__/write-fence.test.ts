import { beforeEach, describe, expect, it } from 'vitest';

import { createChainableMock } from '@/lib/test/trpc-test-helpers';

import { isWriteFenceEnabled, resetWriteFenceCacheForTestsOnly } from '../write-fence';

function supabaseWith(mock: ReturnType<typeof createChainableMock>) {
  return { from: () => mock } as unknown as Parameters<typeof isWriteFenceEnabled>[0];
}

describe('isWriteFenceEnabled', () => {
  beforeEach(() => {
    resetWriteFenceCacheForTestsOnly();
  });

  it('fence_enabled が false なら書き込みを許可する', async () => {
    const supabase = supabaseWith(createChainableMock({ fence_enabled: false }));

    await expect(isWriteFenceEnabled(supabase)).resolves.toBe(false);
  });

  it('fence_enabled が true なら書き込みを block する', async () => {
    const supabase = supabaseWith(createChainableMock({ fence_enabled: true }));

    await expect(isWriteFenceEnabled(supabase)).resolves.toBe(true);
  });

  it('行が無い（missing row）なら fail closed で block する', async () => {
    const supabase = supabaseWith(createChainableMock(null, null));

    await expect(isWriteFenceEnabled(supabase)).resolves.toBe(true);
  });

  it('relation 不在（PGRST205）は disabled 扱いにする（migration/deploy 競合窓での自己DoSを防ぐ）', async () => {
    const supabase = supabaseWith(
      createChainableMock(null, { message: 'relation does not exist', code: 'PGRST205' }),
    );

    await expect(isWriteFenceEnabled(supabase)).resolves.toBe(false);
  });

  it('relation 不在（42P01）も disabled 扱いにする', async () => {
    const supabase = supabaseWith(
      createChainableMock(null, { message: 'undefined_table', code: '42P01' }),
    );

    await expect(isWriteFenceEnabled(supabase)).resolves.toBe(false);
  });

  it('relation 不在以外のエラーは fail closed で block する', async () => {
    const supabase = supabaseWith(
      createChainableMock(null, { message: 'connection reset', code: '08006' }),
    );

    await expect(isWriteFenceEnabled(supabase)).resolves.toBe(true);
  });

  it('allow（disabled）判定は 5 秒キャッシュされ、2 回目は DB を読まない', async () => {
    const mock = createChainableMock({ fence_enabled: false });
    const supabase = supabaseWith(mock);

    await isWriteFenceEnabled(supabase);
    await isWriteFenceEnabled(supabase);

    expect(mock.maybeSingle).toHaveBeenCalledTimes(1);
  });

  it('block 判定はキャッシュされず、毎回 DB を読む', async () => {
    const mock = createChainableMock({ fence_enabled: true });
    const supabase = supabaseWith(mock);

    await isWriteFenceEnabled(supabase);
    await isWriteFenceEnabled(supabase);

    expect(mock.maybeSingle).toHaveBeenCalledTimes(2);
  });
});
