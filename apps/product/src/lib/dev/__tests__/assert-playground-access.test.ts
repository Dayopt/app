import { notFound } from 'next/navigation';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { assertPlaygroundAccess } from '../assert-playground-access';

vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
}));

describe('assertPlaygroundAccess', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('development では playground を表示できる', () => {
    vi.stubEnv('NODE_ENV', 'development');

    assertPlaygroundAccess();

    expect(notFound).not.toHaveBeenCalled();
  });

  it('production では notFound を呼ぶ', () => {
    vi.stubEnv('NODE_ENV', 'production');

    assertPlaygroundAccess();

    expect(notFound).toHaveBeenCalledOnce();
  });
});
