import { describe, expect, it, vi } from 'vitest';

import { getExternalLifecycleAppVersion } from '../external-lifecycle-version';

function database(result: { data: number | null; error: { code?: string } | null }) {
  return {
    rpc: vi.fn(() => ({
      abortSignal: vi.fn(async () => result),
    })),
  } as never;
}

describe('getExternalLifecycleAppVersion', () => {
  it('terminal marker version 1だけをreadyとして返す', async () => {
    await expect(getExternalLifecycleAppVersion(database({ data: 1, error: null }))).resolves.toBe(
      1,
    );
  });

  it.each(['42883', 'PGRST202'])('既知の旧DB code %sだけをpredecessorとして返す', async (code) => {
    await expect(
      getExternalLifecycleAppVersion(database({ data: null, error: { code } })),
    ).resolves.toBe(0);
  });

  it('権限エラーを旧DBへ落とさない', async () => {
    await expect(
      getExternalLifecycleAppVersion(database({ data: null, error: { code: '42501' } })),
    ).rejects.toThrow('External lifecycle schema version could not be verified');
  });

  it('未知versionをfail closedにする', async () => {
    await expect(
      getExternalLifecycleAppVersion(database({ data: 2, error: null })),
    ).rejects.toThrow('External lifecycle schema version is inconsistent');
  });
});
