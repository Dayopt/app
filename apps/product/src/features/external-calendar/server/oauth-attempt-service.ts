import 'server-only';

import { createHash } from 'node:crypto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { env } from '@/env';
import type { Database } from '@/lib/database';

import { resolveGoogleCalendarProjectKey } from './authority-config';
import { ExternalCalendarServiceError } from './external-calendar-service-error';

const BEGIN_ATTEMPT_RPC_NAME = 'begin_calendar_oauth_attempt_v1' as const;
const CLAIM_ATTEMPT_RPC_NAME = 'claim_calendar_oauth_attempt_v1' as const;
const DB_RPC_TIMEOUT_MS = 4_000;

type CalendarOAuthAttemptDatabase = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Pick<
      Database['public']['Functions'],
      typeof BEGIN_ATTEMPT_RPC_NAME | typeof CLAIM_ATTEMPT_RPC_NAME
    >;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

type CalendarOAuthAttemptClient = SupabaseClient<CalendarOAuthAttemptDatabase>;

export type ClaimedCalendarOAuthAttempt = {
  attemptId: string;
  claimExpiresAt: string;
};

function createCalendarOAuthAttemptClient(): CalendarOAuthAttemptClient {
  return createClient<CalendarOAuthAttemptDatabase>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

function resolveProjectKeyOrThrow(): string {
  const projectKey = resolveGoogleCalendarProjectKey();
  if (projectKey === null) {
    throw new ExternalCalendarServiceError(
      'UPDATE_FAILED',
      'calendar authority project is not configured',
    );
  }
  return projectKey;
}

/** PostgREST が PostgreSQL bytea として解釈する SHA-256 hex literal。 */
function digestOAuthSecret(value: string): string {
  return `\\x${createHash('sha256').update(value).digest('hex')}`;
}

/**
 * Google へ送る前に、OAuth state / PKCE verifierをDBのgenerationとproject epochへ束縛する。
 */
export async function beginCalendarOAuthAttempt(input: {
  userId: string;
  state: string;
  verifier: string;
}): Promise<void> {
  const db = createCalendarOAuthAttemptClient();
  const { data, error } = await db
    .rpc(BEGIN_ATTEMPT_RPC_NAME, {
      p_project_key: resolveProjectKeyOrThrow(),
      p_user_id: input.userId,
      p_state_digest: digestOAuthSecret(input.state),
      p_verifier_digest: digestOAuthSecret(input.verifier),
    })
    .abortSignal(AbortSignal.timeout(DB_RPC_TIMEOUT_MS));

  if (error || data?.[0] === undefined) {
    throw new ExternalCalendarServiceError(
      'UPDATE_FAILED',
      'calendar OAuth attempt could not be started',
    );
  }
}

/**
 * code交換より前にattemptを一回だけclaimする。
 *
 * forged/replayed state は通常入力なのでCA016だけはnullへ畳み、raw DB errorを外へ出さない。
 */
export async function claimCalendarOAuthAttempt(input: {
  userId: string;
  state: string;
  verifier: string;
}): Promise<ClaimedCalendarOAuthAttempt | null> {
  const db = createCalendarOAuthAttemptClient();
  const { data, error } = await db
    .rpc(CLAIM_ATTEMPT_RPC_NAME, {
      p_project_key: resolveProjectKeyOrThrow(),
      p_user_id: input.userId,
      p_state_digest: digestOAuthSecret(input.state),
      p_verifier_digest: digestOAuthSecret(input.verifier),
    })
    .abortSignal(AbortSignal.timeout(DB_RPC_TIMEOUT_MS));

  if (error?.code === 'CA016') return null;

  const claimed = data?.[0];
  if (error || claimed === undefined) {
    throw new ExternalCalendarServiceError(
      'UPDATE_FAILED',
      'calendar OAuth attempt could not be claimed',
    );
  }

  return {
    attemptId: claimed.attempt_id,
    claimExpiresAt: claimed.claim_expires_at,
  };
}
