import { createHash } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const createClient = vi.hoisted(() => vi.fn());
const resolveGoogleCalendarProjectKey = vi.hoisted(() => vi.fn());

vi.mock('@supabase/supabase-js', () => ({ createClient }));
vi.mock('@/env', () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  },
}));
vi.mock('../authority-config', () => ({ resolveGoogleCalendarProjectKey }));

import { beginCalendarOAuthAttempt, claimCalendarOAuthAttempt } from '../oauth-attempt-service';

const PROJECT_KEY = '123456789012';
const USER_ID = '00000000-0000-4000-8000-000000000001';
const ATTEMPT_ID = '00000000-0000-4000-8000-0000000000a1';

function digest(value: string): string {
  return `\\x${createHash('sha256').update(value).digest('hex')}`;
}

function setupRpc(response: {
  data: unknown;
  error: { code?: string } | null;
}): ReturnType<typeof vi.fn> {
  const rpc = vi.fn(() => ({
    abortSignal: vi.fn(() => Promise.resolve(response)),
  }));
  createClient.mockReturnValue({ rpc });
  return rpc;
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveGoogleCalendarProjectKey.mockReturnValue(PROJECT_KEY);
});

describe('beginCalendarOAuthAttempt', () => {
  it('stateとverifierのdigestだけをDBへ保存する', async () => {
    const rpc = setupRpc({
      data: [
        {
          attempt_id: ATTEMPT_ID,
          operation_id: crypto.randomUUID(),
          connection_id: crypto.randomUUID(),
          expires_at: '2026-07-26T00:10:00.000Z',
        },
      ],
      error: null,
    });

    await beginCalendarOAuthAttempt({
      userId: USER_ID,
      state: 'state-value',
      verifier: 'verifier-value',
    });

    expect(rpc).toHaveBeenCalledWith('begin_calendar_oauth_attempt_v1', {
      p_project_key: PROJECT_KEY,
      p_user_id: USER_ID,
      p_state_digest: digest('state-value'),
      p_verifier_digest: digest('verifier-value'),
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain('state-value');
    expect(JSON.stringify(rpc.mock.calls)).not.toContain('verifier-value');
  });
});

describe('claimCalendarOAuthAttempt', () => {
  it('claim済みattemptの保存identityだけを返す', async () => {
    setupRpc({
      data: [
        {
          attempt_id: ATTEMPT_ID,
          operation_id: crypto.randomUUID(),
          connection_id: crypto.randomUUID(),
          data_generation: 4,
          project_epoch: 2,
          claim_expires_at: '2026-07-26T00:02:00.000Z',
        },
      ],
      error: null,
    });

    await expect(
      claimCalendarOAuthAttempt({
        userId: USER_ID,
        state: 'state-value',
        verifier: 'verifier-value',
      }),
    ).resolves.toEqual({
      attemptId: ATTEMPT_ID,
      claimExpiresAt: '2026-07-26T00:02:00.000Z',
    });
  });

  it('replayまたは不一致は通常のunavailableへ畳む', async () => {
    setupRpc({ data: null, error: { code: 'CA016' } });

    await expect(
      claimCalendarOAuthAttempt({
        userId: USER_ID,
        state: 'replayed',
        verifier: 'verifier-value',
      }),
    ).resolves.toBeNull();
  });
});
