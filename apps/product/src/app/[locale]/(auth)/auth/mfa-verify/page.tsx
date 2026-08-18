'use client';

import { useCallback, useEffect, useState } from 'react';

import { useParams, useRouter, useSearchParams } from 'next/navigation';

import { logger } from '@/lib/logger';
import { getSafeRedirectPath } from '@/lib/safe-redirect';
import { captureUnexpectedError, observeAuthOperation } from '@/lib/sentry';
import { toast } from '@/lib/toast';
import { captureUnexpectedTrpcClientFailure } from '@/lib/trpc/client-errors';
import { useTranslations } from 'next-intl';

import { MFAVerifyForm } from '@/features/auth';
import { createClient } from '@/lib/supabase/client';
import { vanillaTrpc } from '@/lib/trpc/client';
import { Button } from '@dayopt/components';

type VerifyMode = 'totp' | 'recovery';

export default function MFAVerifyPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams();
  const locale = (params?.locale as string) || 'ja';
  const t = useTranslations();
  const supabase = createClient();

  const [mode, setMode] = useState<VerifyMode>('totp');
  const [verificationCode, setVerificationCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);

  const checkMFARequired = useCallback(async () => {
    try {
      const { data: factors, error: factorsError } = await observeAuthOperation(
        'mfa_list_factors',
        () => supabase.auth.mfa.listFactors(),
        { route: '/auth/mfa-verify' },
      );

      if (factorsError) {
        setError(t('common.errors.mfa.verifyFailed'));
        return;
      }

      if (factors && factors.totp.length > 0) {
        const verifiedFactor = factors.totp.find((f) => f.status === 'verified');
        if (verifiedFactor) {
          setFactorId(verifiedFactor.id);

          const { data: challengeData, error: challengeError } = await observeAuthOperation(
            'mfa_challenge',
            () => supabase.auth.mfa.challenge({ factorId: verifiedFactor.id }),
            { route: '/auth/mfa-verify' },
          );

          if (challengeError) {
            setError(t('common.errors.mfa.challengeFailed'));
            return;
          }

          if (challengeData) {
            setChallengeId(challengeData.id);
          }
        } else {
          router.push('/calendar');
        }
      } else {
        router.push('/calendar');
      }
    } catch (err) {
      logger.error('MFA initialization failed:', err);
      const unexpectedError = err instanceof Error ? err : new Error('Unknown MFA init error');
      captureUnexpectedError(unexpectedError, {
        feature: 'auth',
        source: 'mfa_verify',
        operation: 'init',
        route: '/auth/mfa-verify',
      });
      setError(t('common.errors.mfa.verifyFailed'));
    }
  }, [router, supabase, t]);

  useEffect(() => {
    queueMicrotask(() => void checkMFARequired());
  }, [checkMFARequired]);

  const handleVerifyTotp = async () => {
    if (!factorId || !challengeId || !verificationCode) {
      setError(t('common.errors.mfa.enterCode'));
      return;
    }

    if (verificationCode.length !== 6) {
      setError(t('common.errors.mfa.codeLength'));
      return;
    }

    setIsVerifying(true);
    setError(null);

    try {
      const { error: verifyError } = await observeAuthOperation(
        'mfa_verify',
        () =>
          supabase.auth.mfa.verify({
            factorId,
            challengeId,
            code: verificationCode,
          }),
        { route: '/auth/mfa-verify' },
      );

      if (verifyError) {
        throw new Error(verifyError.message);
      }

      const next = getSafeRedirectPath(searchParams?.get('next') ?? null, `/${locale}/calendar`);
      router.refresh();
      router.push(next);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t('common.errors.mfa.codeInvalid');
      setError(errorMessage);
      setVerificationCode('');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleVerifyRecovery = async () => {
    const trimmed = recoveryCode.trim().toUpperCase();
    if (!trimmed) {
      setError(t('auth.mfaVerify.recoveryInvalid'));
      return;
    }

    setIsVerifying(true);
    setError(null);

    try {
      await vanillaTrpc.user.verifyRecoveryCode.mutate({ code: trimmed });

      toast.success(t('auth.mfaVerify.recoverySuccess'));
      const next = getSafeRedirectPath(searchParams?.get('next') ?? null, `/${locale}/calendar`);
      router.refresh();
      router.push(next);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message.includes('RECOVERY_EXHAUSTED')) {
        setError(t('auth.mfaVerify.recoveryExhausted'));
      } else if (message.includes('RECOVERY_INVALID')) {
        setError(t('auth.mfaVerify.recoveryInvalid'));
      } else {
        const captured = captureUnexpectedTrpcClientFailure(err, {
          feature: 'auth',
          operation: 'verify_recovery_code',
          route: '/auth/mfa-verify',
        });
        if (captured) logger.error('MFA recovery transport failed');
        setError(t('common.errors.generic'));
      }
      setRecoveryCode('');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSwitchMode = (newMode: VerifyMode) => {
    setMode(newMode);
    setError(null);
    setVerificationCode('');
    setRecoveryCode('');
  };

  return (
    <div className="bg-surface-container flex min-h-svh flex-col items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-sm">
        <MFAVerifyForm
          mode={mode}
          flow="login"
          verificationCode={verificationCode}
          onVerificationCodeChange={setVerificationCode}
          recoveryCode={recoveryCode}
          onRecoveryCodeChange={setRecoveryCode}
          isVerifying={isVerifying}
          error={error}
          onVerifyTotp={handleVerifyTotp}
          onVerifyRecovery={handleVerifyRecovery}
          onSwitchMode={handleSwitchMode}
          backHref={`/${locale}/auth/login`}
        />
        {/* MFA初期化失敗時のリトライ（challengeId未取得 = フォーム操作不可） */}
        {error && !challengeId && (
          <div className="mt-4 text-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setError(null);
                checkMFARequired();
              }}
            >
              {t('common.actions.retry')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
