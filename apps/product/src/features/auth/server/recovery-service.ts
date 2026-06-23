import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { verifyRecoveryCode } from '@/lib/auth/recovery-codes';
import type { Database } from '@/lib/database';
import { logger } from '@/lib/logger';
import { createServiceRoleClient } from '@/lib/supabase/oauth';
import { ServiceError } from '@/lib/trpc/errors';

class RecoveryServiceError extends ServiceError {
  constructor(
    code: 'RECOVERY_EXHAUSTED' | 'RECOVERY_INVALID' | 'RECOVERY_FAILED',
    message: string,
  ) {
    super(code, message);
    this.name = 'RecoveryServiceError';
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
      logger.error('Failed to fetch recovery codes:', fetchError);
      throw new RecoveryServiceError('RECOVERY_FAILED', fetchError.message);
    }

    if (!codes || codes.length === 0) {
      throw new RecoveryServiceError('RECOVERY_EXHAUSTED', 'RECOVERY_EXHAUSTED');
    }

    const matchedCode = codes.find((candidate) => verifyRecoveryCode(code, candidate.code_hash));
    if (!matchedCode) {
      throw new RecoveryServiceError('RECOVERY_INVALID', 'RECOVERY_INVALID');
    }

    const { data: used, error: rpcError } = await this.supabase.rpc('use_recovery_code', {
      p_user_id: userId,
      p_code_hash: matchedCode.code_hash,
    });

    if (rpcError || !used) {
      logger.error('Failed to mark recovery code as used:', rpcError);
      throw new RecoveryServiceError(
        'RECOVERY_FAILED',
        rpcError?.message ?? 'Failed to use recovery code',
      );
    }

    try {
      const adminClient = createServiceRoleClient();
      const { data: factors } = await adminClient.auth.admin.mfa.listFactors({ userId });

      if (factors?.factors) {
        for (const factor of factors.factors) {
          if (factor.status === 'verified') {
            await adminClient.auth.admin.mfa.deleteFactor({ userId, id: factor.id });
          }
        }
      }
    } catch (error) {
      logger.error('Failed to unenroll MFA factor:', error);
      throw new RecoveryServiceError(
        'RECOVERY_FAILED',
        error instanceof Error ? error.message : 'Failed to unenroll MFA factor',
      );
    }

    const { data: remainingCount, error: countError } = await this.supabase.rpc(
      'count_unused_recovery_codes',
      { p_user_id: userId },
    );

    if (countError) {
      logger.error('Failed to count remaining recovery codes:', countError);
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
