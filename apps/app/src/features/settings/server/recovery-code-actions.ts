'use server';

import { generateRecoveryCodes, hashRecoveryCode } from '@/lib/auth/recovery-codes';
import { createClient } from '@/lib/supabase/server';

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
    } = await supabase.auth.getUser();

    if (!user) {
      return { codes: null, error: 'User not found' };
    }

    const codes = generateRecoveryCodes();

    // 既存のコードを削除
    await supabase.from('mfa_recovery_codes').delete().eq('user_id', user.id);

    // 新しいコードを保存
    const codesForDb = codes.map((code) => ({
      user_id: user.id,
      code_hash: hashRecoveryCode(code),
    }));

    const { error: insertError } = await supabase.from('mfa_recovery_codes').insert(codesForDb);

    if (insertError) {
      return { codes: null, error: insertError.message };
    }

    return { codes, error: null };
  } catch (err) {
    return { codes: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
