import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { verifyRecoveryCode } from '@/lib/auth/recovery-codes';
import type { Database } from '@/lib/database';
import { logger } from '@/lib/logger';
import { captureUnexpectedDatabaseError, observeAuthOperation } from '@/lib/sentry';
import { createServiceRoleClient } from '@/lib/supabase/oauth';
import { ServiceError } from '@/lib/trpc/errors';

class RecoveryServiceError extends ServiceError {
  constructor(
    code: 'RECOVERY_EXHAUSTED' | 'RECOVERY_INVALID' | 'RECOVERY_FAILED',
    message: string,
    options?: ErrorOptions,
  ) {
    super(code, message);
    this.name = 'RecoveryServiceError';
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

export class RecoveryService {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async verify(options: { userId: string; code: string }) {
    const { userId, code } = options;
    const { data: codes, error: fetchError } = await this.supabase
      .from('mfa_recovery_codes')
      .select('id, code_hash')
      .eq('user_id', userId)
      .is('used_at', null);

    if (fetchError) {
      logger.error('Failed to fetch recovery codes');
      const original = captureUnexpectedDatabaseError(fetchError, {
        feature: 'mfa_recovery',
        operation: 'fetch_recovery_codes',
      });
      throw new RecoveryServiceError('RECOVERY_FAILED', 'Failed to fetch recovery codes', {
        cause: original,
      });
    }

    if (!codes || codes.length === 0) {
      throw new RecoveryServiceError('RECOVERY_EXHAUSTED', 'RECOVERY_EXHAUSTED');
    }

    const matchedCode = codes.find((candidate) => verifyRecoveryCode(code, candidate.code_hash));
    if (!matchedCode) {
      throw new RecoveryServiceError('RECOVERY_INVALID', 'RECOVERY_INVALID');
    }

    const adminClient = createServiceRoleClient();
    const { data: used, error: rpcError } = await adminClient.rpc('use_recovery_code', {
      p_user_id: userId,
      p_code_hash: matchedCode.code_hash,
    });

    if (rpcError || !used) {
      logger.error('Failed to mark recovery code as used');
      const original = captureUnexpectedDatabaseError(
        rpcError ?? new Error('Recovery code RPC returned an unsuccessful result'),
        { feature: 'mfa_recovery', operation: 'consume_recovery_code' },
      );
      throw new RecoveryServiceError('RECOVERY_FAILED', 'Failed to use recovery code', {
        cause: original,
      });
    }

    try {
      const { data: factors, error: listFactorsError } = await observeAuthOperation(
        'recovery_list_mfa_factors',
        () => adminClient.auth.admin.mfa.listFactors({ userId }),
        { feature: 'mfa_recovery' },
      );
      if (listFactorsError) throw listFactorsError;

      if (factors?.factors) {
        for (const factor of factors.factors) {
          if (factor.status === 'verified') {
            const { error: deleteFactorError } = await observeAuthOperation(
              'recovery_delete_mfa_factor',
              () => adminClient.auth.admin.mfa.deleteFactor({ userId, id: factor.id }),
              { feature: 'mfa_recovery' },
            );
            if (deleteFactorError) throw deleteFactorError;
          }
        }
      }
    } catch (error) {
      logger.error('Failed to unenroll MFA factor:', error);
      throw new RecoveryServiceError('RECOVERY_FAILED', 'Failed to unenroll MFA factor', {
        cause: error instanceof Error ? error : undefined,
      });
    }

    const { data: remainingCount, error: countError } = await this.supabase.rpc(
      'count_unused_recovery_codes',
      { p_user_id: userId },
    );

    if (countError) {
      logger.error('Failed to count remaining recovery codes');
      captureUnexpectedDatabaseError(countError, {
        feature: 'mfa_recovery',
        operation: 'count_remaining_recovery_codes',
      });
    }

    return {
      success: true as const,
      remainingCodes: typeof remainingCount === 'number' ? remainingCount : 0,
    };
  }
}

export function createRecoveryService(supabase: SupabaseClient<Database>): RecoveryService {
  return new RecoveryService(supabase);
}
