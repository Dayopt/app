'use server';

import { generateRecoveryCodes, hashRecoveryCode } from '@/lib/auth/recovery-codes';
import { captureUnexpectedDatabaseError, observeAuthOperation } from '@/lib/sentry';
import { createClient } from '@/lib/supabase/server';

const RECOVERY_CODE_FAILURE = 'Failed to generate recovery codes';

function captureRecoveryCodeFailure(error: unknown, operation: string): void {
  captureUnexpectedDatabaseError(error, {
    feature: 'mfa_recovery_codes',
    operation,
  });
}

/**
 * リカバリーコードを生成しDBに保存する Server Action
 *
 * recovery-codes.ts は server-only のため client component から直接 import できない。
 * この Server Action を経由することで client/server 境界を正しく分離する。
 */
export async function generateAndSaveRecoveryCodesAction(): Promise<{
  codes: string[] | null;
  error: string | null;
}> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await observeAuthOperation('recovery_codes_get_user', () => supabase.auth.getUser());

    if (!user) {
      return { codes: null, error: 'User not found' };
    }

    const codes = generateRecoveryCodes();

    // 既存のコードを削除
    const { error: deleteError } = await supabase
      .from('mfa_recovery_codes')
      .delete()
      .eq('user_id', user.id);
    if (deleteError) {
      captureRecoveryCodeFailure(deleteError, 'delete_existing_codes');
      return { codes: null, error: RECOVERY_CODE_FAILURE };
    }

    // 新しいコードを保存
    const codesForDb = codes.map((code) => ({
      user_id: user.id,
      code_hash: hashRecoveryCode(code),
    }));

    const { error: insertError } = await supabase.from('mfa_recovery_codes').insert(codesForDb);

    if (insertError) {
      captureRecoveryCodeFailure(insertError, 'insert_new_codes');
      return { codes: null, error: RECOVERY_CODE_FAILURE };
    }

    return { codes, error: null };
  } catch (err) {
    captureRecoveryCodeFailure(err, 'generate_and_save_codes');
    return { codes: null, error: RECOVERY_CODE_FAILURE };
  }
}
