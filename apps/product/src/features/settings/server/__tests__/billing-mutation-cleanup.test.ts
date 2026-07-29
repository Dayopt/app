import { describe, expect, it, vi } from 'vitest';

import { cleanupBillingMutationClaims } from '../billing-mutation-service';

function database(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn(() => ({
    abortSignal: vi.fn(async () => result),
  }));
  return { client: { rpc } as never, rpc };
}

describe('cleanupBillingMutationClaims', () => {
  it('削除数、URL redaction数、残件をaggregateで返す', async () => {
    const { client, rpc } = database({
      data: [{ claims_deleted: 3, has_more: true, provider_responses_redacted: 5 }],
      error: null,
    });

    await expect(cleanupBillingMutationClaims(client, { limit: 250 })).resolves.toEqual({
      claimsDeleted: 3,
      hasMore: true,
      providerResponsesRedacted: 5,
    });
    expect(rpc).toHaveBeenCalledWith('cleanup_billing_mutation_claims_v2', {
      p_limit: 250,
    });
  });

  it('不完全な結果はfail closedにする', async () => {
    const { client } = database({
      data: [{ claims_deleted: 0, provider_responses_redacted: 0 }],
      error: null,
    });

    await expect(cleanupBillingMutationClaims(client, { limit: 250 })).rejects.toMatchObject({
      code: 'CLEANUP_FAILED',
    });
  });
});
