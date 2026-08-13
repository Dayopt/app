import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database';
import { logger } from '@/lib/logger';
import { observeAuthOperation } from '@/lib/sentry';

export type MfaAssuranceLevel = 'aal1' | 'aal2';

export interface MfaAssurance {
  currentLevel: MfaAssuranceLevel | null;
  nextLevel: MfaAssuranceLevel | null;
  lookupFailed?: boolean | undefined;
}

interface SessionAuthContext {
  userId?: string | undefined;
  sessionId?: string | undefined;
  mfaAssurance?: MfaAssurance | undefined;
}

type SessionAuthOperationPrefix = 'trpc_context' | 'rsc_trpc' | 'calendar_connect';

function createFailedMfaAssurance(): MfaAssurance {
  return {
    currentLevel: null,
    nextLevel: null,
    lookupFailed: true,
  };
}

/** SupabaseはAAL claimがない従来sessionをnullで返すため、AAL1として扱う。 */
function normalizeMfaAssuranceLevel(level: unknown): MfaAssuranceLevel | undefined {
  if (level === null || level === 'aal1') return 'aal1';
  if (level === 'aal2') return 'aal2';
  return undefined;
}

export function isValidMfaAssuranceTransition(currentLevel: unknown, nextLevel: unknown): boolean {
  if (currentLevel === 'aal1') return nextLevel === 'aal1' || nextLevel === 'aal2';
  return currentLevel === 'aal2' && nextLevel === 'aal2';
}

/** HTTP/RSCのsession contextへ同じ認証情報とfail-closed MFA状態を設定する。 */
export async function resolveSessionAuthContext(
  supabase: SupabaseClient<Database>,
  operationPrefix: SessionAuthOperationPrefix,
): Promise<SessionAuthContext> {
  let userId: string | undefined;

  try {
    // getUser()でAuth serverに問い合わせ、cookie由来JWTを検証する。
    const {
      data: { user },
      error: userError,
    } = await observeAuthOperation(`${operationPrefix}_get_user`, () => supabase.auth.getUser());

    if (userError || !user) return {};
    userId = user.id;
  } catch {
    // 未検証のuserIdはcontextへ入れず、protectedProcedureでUNAUTHORIZEDにする。
    return {};
  }

  let sessionId: string | undefined;
  try {
    const {
      data: { session },
      error: sessionError,
    } = await observeAuthOperation(`${operationPrefix}_get_session`, () =>
      supabase.auth.getSession(),
    );
    if (sessionError) {
      logger.warn('Session token lookup failed');
    } else {
      sessionId = session?.access_token;
    }
  } catch {
    // session tokenはログ用であり、失敗しても独立したMFA lookupを継続する。
    logger.warn('Session token lookup threw');
  }

  const mfaAssurance = await resolveMfaAssurance(supabase, operationPrefix);

  return { userId, sessionId, mfaAssurance };
}

/**
 * MFA assurance level のみを解決する。`resolveSessionAuthContext` の一部を、
 * userId/sessionId 抽出を伴わずに呼びたい呼び出し元(Route Handler 等)向けに切り出したもの。
 *
 * `getAuthenticatorAssuranceLevel()` を jwt 引数なしで呼ぶため、AAL claim は
 * server 未検証の session storage（cookie 由来）から読まれる。`proxy.ts` の
 * MFA redirect 判定・`protectedProcedure` の tRPC guard も同じ trust 前提を
 * 共有しており、本関数もそれを継承する（新規に開けた穴ではない）。
 */
export async function resolveMfaAssurance(
  supabase: SupabaseClient<Database>,
  operationPrefix: SessionAuthOperationPrefix,
): Promise<MfaAssurance> {
  try {
    const { data: aalData, error: aalError } = await observeAuthOperation(
      `${operationPrefix}_get_authenticator_assurance_level`,
      () => supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    );
    const currentLevel = normalizeMfaAssuranceLevel(aalData?.currentLevel);
    const nextLevel = normalizeMfaAssuranceLevel(aalData?.nextLevel);

    if (
      aalError ||
      currentLevel === undefined ||
      nextLevel === undefined ||
      !isValidMfaAssuranceTransition(currentLevel, nextLevel)
    ) {
      logger.warn('MFA assurance lookup failed');
      return createFailedMfaAssurance();
    }

    return { currentLevel, nextLevel };
  } catch {
    logger.warn('MFA assurance lookup threw');
    return createFailedMfaAssurance();
  }
}
