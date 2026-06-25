'use client';

import { useCallback, useEffect, useState } from 'react';

import { useParams, useRouter, useSearchParams } from 'next/navigation';

import * as Sentry from '@sentry/nextjs';

import { logger } from '@/lib/logger';
import { getSafeRedirectPath } from '@/lib/safe-redirect';
import { toast } from '@/lib/toast';
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
      const { data: factors } = await supabase.auth.mfa.listFactors();

      if (factors && factors.totp.length > 0) {
        const verifiedFactor = factors.totp.find((f) => f.status === 'verified');
        if (verifiedFactor) {
          setFactorId(verifiedFactor.id);

          const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
            factorId: verifiedFactor.id,
          });

          if (challengeError) {
            setError(t('common.errors.mfa.challengeFailed'));
            return;
          }

          if (challengeData) {
            setChallengeId(challengeData.id);
          }
        } else {
          router.push('/week');
        }
      } else {
        router.push('/week');
      }
    } catch (err) {
      logger.error('MFA initialization failed:', err);
      Sentry.captureException(err, {
        tags: { source: 'mfa_verify', operation: 'init' },
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
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId,
        code: verificationCode,
      });

      if (verifyError) {
        throw new Error(verifyError.message);
      }

      const next = getSafeRedirectPath(searchParams?.get('next') ?? null, `/${locale}/week`);
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
      const next = getSafeRedirectPath(searchParams?.get('next') ?? null, `/${locale}/week`);
      router.refresh();
      router.push(next);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message.includes('RECOVERY_EXHAUSTED')) {
        setError(t('auth.mfaVerify.recoveryExhausted'));
      } else if (message.includes('RECOVERY_INVALID')) {
        setError(t('auth.mfaVerify.recoveryInvalid'));
      } else {
        logger.error('MFA recovery verification failed:', err);
        Sentry.captureException(err, {
          tags: { source: 'mfa_verify', operation: 'recovery' },
        });
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
      <div className="w-full md:max-w-5xl">
        <MFAVerifyForm
          mode={mode}
          verificationCode={verificationCode}
          onVerificationCodeChange={setVerificationCode}
          recoveryCode={recoveryCode}
          onRecoveryCodeChange={setRecoveryCode}
          isVerifying={isVerifying}
          error={error}
          onVerifyTotp={handleVerifyTotp}
          onVerifyRecovery={handleVerifyRecovery}
          onSwitchMode={handleSwitchMode}
          loginHref={`/${locale}/auth/login`}
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
