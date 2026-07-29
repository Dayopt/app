import { describe, expect, it, vi } from 'vitest';

import { resolveBillingLifecycleMode } from '../billing-lifecycle-mode';

function database(input: {
  activated?: boolean;
  activeOperations?: number;
  version?: 0 | 1;
  versionError?: { code: string };
}) {
  const rpc = vi.fn((operation: string) => {
    if (operation === 'get_external_lifecycle_app_version_v2') {
      return {
        abortSignal: vi.fn(async () => ({
          data: input.version ?? null,
          error: input.versionError ?? null,
        })),
      };
    }
    return Promise.resolve({
      data: [
        {
          activated: input.activated ?? false,
          active_operations: input.activeOperations ?? 0,
        },
      ],
      error: null,
    });
  });
  return { client: { rpc } as never, rpc };
}

describe('resolveBillingLifecycleMode', () => {
  it('predecessor schemaではlegacyを維持する', async () => {
    const { client, rpc } = database({ versionError: { code: 'PGRST202' } });

    await expect(resolveBillingLifecycleMode(client)).resolves.toBe('legacy');
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('terminal schemaでもactivation前はlegacyを維持する', async () => {
    const { client } = database({ version: 1 });

    await expect(resolveBillingLifecycleMode(client)).resolves.toBe('legacy');
  });

  it('old instance drain後のactivationでdurableへ切り替える', async () => {
    const { client } = database({ version: 1, activated: true });

    await expect(resolveBillingLifecycleMode(client)).resolves.toBe('durable');
  });

  it('inactiveなのに削除処理が残る状態はfail closedにする', async () => {
    const { client } = database({ version: 1, activeOperations: 1 });

    await expect(resolveBillingLifecycleMode(client)).rejects.toThrow(
      'Inactive Billing lifecycle has active account deletions',
    );
  });
});
