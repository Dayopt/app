'use client';

import { useCallback, useEffect, useState } from 'react';

import { useTranslations } from 'next-intl';

import { logger } from '@/lib/logger';
import { captureBusinessEvent } from '@/lib/sentry';
import { createClient } from '@/lib/supabase/client';

interface MFAState {
  hasMFA: boolean;
  showMFASetup: boolean;
  qrCode: string | null;
  secret: string | null;
  factorId: string | null;
  verificationCode: string;
  error: string | null;
  success: string | null;
  isLoading: boolean;
  /** 新しく生成されたリカバリーコード（表示後はnull） */
  recoveryCodes: string[] | null;
  /** 残りのリカバリーコード数 */
  recoveryCodeCount: number;
  /** MFA無効化ダイアログ表示状態 */
  showDisableDialog: boolean;
  /** リカバリーコード再生成確認ダイアログ表示状態 */
  showRegenerateDialog: boolean;
}

export interface UseMFAReturn extends MFAState {
  setVerificationCode: (code: string) => void;
  enrollMFA: () => Promise<void>;
  verifyMFA: () => Promise<void>;
  /** MFA無効化ダイアログを開く */
  requestDisableMFA: () => void;
  /** MFA無効化を実行（TOTPコード必須） */
  confirmDisableMFA: (code: string) => Promise<void>;
  /** MFA無効化ダイアログを閉じる */
  cancelDisableMFA: () => void;
  cancelSetup: () => void;
  /** リカバリーコード再生成確認ダイアログを開く */
  requestRegenerateRecoveryCodes: () => void;
  /** リカバリーコード再生成を実行 */
  confirmRegenerateRecoveryCodes: () => Promise<void>;
  /** リカバリーコード再生成確認ダイアログを閉じる */
  cancelRegenerateRecoveryCodes: () => void;
  /** リカバリーコード表示を閉じる */
  dismissRecoveryCodes: () => void;
}

/**
 * MFA（二段階認証）管理フック
 *
 * Supabase MFA APIを使用して、TOTP認証の登録・検証・無効化を行う
 */
export function useMFA(): UseMFAReturn {
  const t = useTranslations();
  const [hasMFA, setHasMFA] = useState(false);
  const [showMFASetup, setShowMFASetup] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [recoveryCodeCount, setRecoveryCodeCount] = useState(0);
  const [showDisableDialog, setShowDisableDialog] = useState(false);
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);

  const supabase = createClient();

  // MFA状態チェック
  const checkMFAStatus = useCallback(async () => {
    try {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      if (factors && factors.totp.length > 0) {
        const verifiedFactor = factors.totp.find((f) => f.status === 'verified');
        setHasMFA(!!verifiedFactor);

        // リカバリーコード数を取得
        if (verifiedFactor) {
          const { data: userData } = await supabase.auth.getUser();
          if (userData.user?.id) {
            const { data: countData } = await supabase.rpc('count_unused_recovery_codes', {
              p_user_id: userData.user.id,
            });
            setRecoveryCodeCount(typeof countData === 'number' ? countData : 0);
          }
        }
      }
    } catch (err) {
      logger.error('MFA status check error:', err);
    }
  }, [supabase]);

  // リカバリーコード生成・保存（Server Action経由）
  const generateAndSaveRecoveryCodes = useCallback(async (): Promise<string[] | null> => {
    try {
      const { generateAndSaveRecoveryCodesAction } = await import(
        '@/features/settings/server/recovery-code-actions'
      );
      const { codes, error } = await generateAndSaveRecoveryCodesAction();
      if (error) {
        logger.error('Failed to generate recovery codes:', error);
        return null;
      }
      return codes;
    } catch (err) {
      logger.error('Recovery code generation error:', err);
      return null;
    }
  }, []);

  // 初回マウント時にMFA状態チェック
  useEffect(() => {
    checkMFAStatus();
  }, [checkMFAStatus]);

  // MFA登録開始
  const enrollMFA = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Authenticator App',
      });

      if (enrollError) {
        throw new Error(`${t('common.errors.mfa.enrollFailed')}: ${enrollError.message}`);
      }

      if (data) {
        setFactorId(data.id);
        setSecret(data.totp.secret);
        const { default: QRCode } = await import('qrcode');
        const qrCodeDataUrl = await QRCode.toDataURL(data.totp.uri);
        setQrCode(qrCodeDataUrl);
        setShowMFASetup(true);
      } else {
        throw new Error(t('common.errors.mfa.dataNotFound'));
      }
    } catch (err) {
      logger.error('MFA enrollment error:', err);
      const errorMessage = err instanceof Error ? err.message : t('common.errors.mfa.setupFailed');
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [supabase, t]);

  // MFA検証
  const verifyMFA = useCallback(async () => {
    if (!factorId || !verificationCode) {
      setError(t('common.errors.mfa.enterCode'));
      return;
    }

    if (verificationCode.length !== 6) {
      setError(t('common.errors.mfa.codeLength'));
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // enrollment時はchallengeを発行してからverifyする
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId,
      });

      if (challengeError) {
        throw new Error(`${t('common.errors.mfa.challengeFailed')}: ${challengeError.message}`);
      }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code: verificationCode,
      });

      if (verifyError) {
        throw new Error(`${t('common.errors.mfa.verifyFailed')}: ${verifyError.message}`);
      }

      // セッションを更新（AAL2に昇格）
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData?.session) {
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      }

      // リカバリーコードを生成
      const codes = await generateAndSaveRecoveryCodes();
      if (codes) {
        setRecoveryCodes(codes);
        setRecoveryCodeCount(codes.length);
      }

      captureBusinessEvent('account.mfa_changed', { action: 'enroll' });
      setSuccess(t('common.errors.mfa.enabled'));
      setHasMFA(true);
      setShowMFASetup(false);
      setVerificationCode('');
      setQrCode(null);
      setSecret(null);
      setFactorId(null);

      await checkMFAStatus();
    } catch (err) {
      logger.error('MFA verification error:', err);
      const errorMessage =
        err instanceof Error ? err.message : t('common.errors.mfa.verificationFailed');
      setError(errorMessage);
      setVerificationCode('');
    } finally {
      setIsLoading(false);
    }
  }, [factorId, verificationCode, supabase, checkMFAStatus, generateAndSaveRecoveryCodes, t]);

  // MFA無効化ダイアログ制御
  const requestDisableMFA = useCallback(() => {
    setError(null);
    setShowDisableDialog(true);
  }, []);

  const cancelDisableMFA = useCallback(() => {
    setShowDisableDialog(false);
  }, []);

  // MFA無効化実行（ダイアログからTOTPコードを受け取る）
  const confirmDisableMFA = useCallback(
    async (code: string) => {
      if (!code || code.length !== 6) {
        setError(t('common.errors.mfa.enterCode'));
        return;
      }

      setIsLoading(true);
      setError(null);
      setSuccess(null);

      try {
        const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();

        if (listError) {
          throw new Error(`${t('common.errors.mfa.factorListFailed')}: ${listError.message}`);
        }

        if (!factors || factors.totp.length === 0) {
          setError(t('common.errors.mfa.noFactorFound'));
          return;
        }

        const verifiedFactor = factors.totp.find((f) => f.status === 'verified');

        if (!verifiedFactor) {
          setError(t('common.errors.mfa.noVerifiedFactor'));
          return;
        }

        // MFAチャレンジを実行してAAL2に昇格
        const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
          factorId: verifiedFactor.id,
        });

        if (challengeError) {
          throw new Error(`${t('common.errors.mfa.challengeFailed')}: ${challengeError.message}`);
        }

        // チャレンジを検証してAAL2に昇格
        const { error: verifyError } = await supabase.auth.mfa.verify({
          factorId: verifiedFactor.id,
          challengeId: challengeData.id,
          code: code,
        });

        if (verifyError) {
          throw new Error(t('common.errors.mfa.codeInvalid'));
        }

        // AAL2セッションでMFA無効化
        const { error: unenrollError } = await supabase.auth.mfa.unenroll({
          factorId: verifiedFactor.id,
        });

        if (unenrollError) {
          throw new Error(`${t('common.errors.mfa.disableFailed')}: ${unenrollError.message}`);
        }

        captureBusinessEvent('account.mfa_changed', { action: 'unenroll' });
        setSuccess(t('common.errors.mfa.disabled'));
        setHasMFA(false);
        setShowDisableDialog(false);

        await checkMFAStatus();
      } catch (err) {
        logger.error('MFA disable error:', err);
        const errorMessage =
          err instanceof Error ? err.message : t('common.errors.mfa.disableGeneralFailed');
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    },
    [supabase, checkMFAStatus, t],
  );

  // セットアップキャンセル（未検証factorをunenrollしてクリーンアップ）
  const cancelSetup = useCallback(async () => {
    if (factorId) {
      try {
        await supabase.auth.mfa.unenroll({ factorId });
      } catch (err) {
        logger.error('Failed to unenroll pending factor:', err);
      }
    }
    setShowMFASetup(false);
    setQrCode(null);
    setSecret(null);
    setFactorId(null);
    setVerificationCode('');
  }, [factorId, supabase]);

  // リカバリーコード再生成ダイアログ制御
  const requestRegenerateRecoveryCodes = useCallback(() => {
    setError(null);
    setShowRegenerateDialog(true);
  }, []);

  const cancelRegenerateRecoveryCodes = useCallback(() => {
    setShowRegenerateDialog(false);
  }, []);

  // リカバリーコード再生成実行
  const confirmRegenerateRecoveryCodes = useCallback(async () => {
    setShowRegenerateDialog(false);
    setIsLoading(true);
    setError(null);

    try {
      const codes = await generateAndSaveRecoveryCodes();
      if (codes) {
        setRecoveryCodes(codes);
        setRecoveryCodeCount(codes.length);
        setSuccess(t('settings.account.mfa.recoveryCodes.regenerateSuccess'));
      } else {
        setError(t('settings.account.mfa.recoveryCodes.regenerateFailed'));
      }
    } catch (err) {
      logger.error('Recovery code regeneration error:', err);
      setError(t('settings.account.mfa.recoveryCodes.regenerateFailed'));
    } finally {
      setIsLoading(false);
    }
  }, [generateAndSaveRecoveryCodes, t]);

  // リカバリーコード表示を閉じる
  const dismissRecoveryCodes = useCallback(() => {
    setRecoveryCodes(null);
  }, []);

  return {
    hasMFA,
    showMFASetup,
    qrCode,
    secret,
    factorId,
    verificationCode,
    error,
    success,
    isLoading,
    recoveryCodes,
    recoveryCodeCount,
    showDisableDialog,
    showRegenerateDialog,
    setVerificationCode,
    enrollMFA,
    verifyMFA,
    requestDisableMFA,
    confirmDisableMFA,
    cancelDisableMFA,
    cancelSetup,
    requestRegenerateRecoveryCodes,
    confirmRegenerateRecoveryCodes,
    cancelRegenerateRecoveryCodes,
    dismissRecoveryCodes,
  };
}
