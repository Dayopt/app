import { describe, expect, it, vi } from 'vitest';

import {
  getExternalLifecycleAppVersion,
  isFencedCalendarSyncWriterReady,
} from './external-lifecycle-version';

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

// #2050: getExternalLifecycleAppVersion とは独立した専用 marker（overview.md §0 改訂）。
// 既存の共有関数を widen すると無関係な呼び出し元（settings/billing・cron dispatcher 等）
// を巻き込むため、別関数として分離した。
describe('isFencedCalendarSyncWriterReady', () => {
  it('v3 marker（version 2）が揃っていれば true を返す', async () => {
    await expect(isFencedCalendarSyncWriterReady(database({ data: 2, error: null }))).resolves.toBe(
      true,
    );
  });

  it.each(['42883', 'PGRST202'])(
    'v3 未適用（既知の旧DB code %s）なら false を返す',
    async (code) => {
      await expect(
        isFencedCalendarSyncWriterReady(database({ data: null, error: { code } })),
      ).resolves.toBe(false);
    },
  );

  it('権限エラーを未適用へ落とさない', async () => {
    await expect(
      isFencedCalendarSyncWriterReady(database({ data: null, error: { code: '42501' } })),
    ).rejects.toThrow('Fenced calendar sync writer schema version could not be verified');
  });

  it('未知versionをfail closedにする', async () => {
    await expect(
      isFencedCalendarSyncWriterReady(database({ data: 1, error: null })),
    ).rejects.toThrow('Fenced calendar sync writer schema version is inconsistent');
  });
});
