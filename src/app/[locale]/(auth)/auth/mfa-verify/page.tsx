'use client';

import { useEffect, useState } from 'react';

import Image from 'next/image';
import { useParams, useRouter, useSearchParams } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { createClient } from '@/platform/supabase/client';
import { vanillaTrpc } from '@/platform/trpc/client';
import { useTranslations } from 'next-intl';

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

  useEffect(() => {
    // ログイン後にMFAチャレンジを発行
    checkMFARequired();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkMFARequired = async () => {
    try {
      const { data: factors } = await supabase.auth.mfa.listFactors();

      if (factors && factors.totp.length > 0) {
        // 最初の有効なTOTPファクターを使用
        const verifiedFactor = factors.totp.find((f) => f.status === 'verified');
        if (verifiedFactor) {
          setFactorId(verifiedFactor.id);

          // MFAチャレンジを発行（公式ベストプラクティス）
          const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
            factorId: verifiedFactor.id,
          });

          if (challengeError) {
            setError('MFAチャレンジの作成に失敗しました');
            return;
          }

          if (challengeData) {
            setChallengeId(challengeData.id);
          }
        } else {
          // MFAが設定されていない場合はリダイレクト
          router.push('/calendar/day');
        }
      } else {
        // MFAが設定されていない場合はリダイレクト
        router.push('/calendar/day');
      }
    } catch {
      setError('MFA状態の確認に失敗しました');
    }
  };

  const handleVerifyTotp = async () => {
    if (!factorId || !challengeId || !verificationCode) {
      setError('6桁のコードを入力してください');
      return;
    }

    if (verificationCode.length !== 6) {
      setError('コードは6桁である必要があります');
      return;
    }

    setIsVerifying(true);
    setError(null);

    try {
      // 公式ベストプラクティス: 保存済みのchallengeIdを使用
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId,
        code: verificationCode,
      });

      if (verifyError) {
        throw new Error(verifyError.message);
      }

      // 検証成功、次のページへリダイレクト
      const next = searchParams?.get('next') || `/${locale}/calendar/day`;
      router.refresh();
      router.push(next);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : '無効なコードです。もう一度お試しください';
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

      // MFA解除成功 → セッションリフレッシュしてカレンダーへ
      const next = searchParams?.get('next') || `/${locale}/calendar/day`;
      router.refresh();
      router.push(next);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message.includes('RECOVERY_EXHAUSTED')) {
        setError(t('auth.mfaVerify.recoveryExhausted'));
      } else if (message.includes('RECOVERY_INVALID')) {
        setError(t('auth.mfaVerify.recoveryInvalid'));
      } else {
        setError(t('auth.mfaVerify.recoveryInvalid'));
      }
      setRecoveryCode('');
    } finally {
      setIsVerifying(false);
    }
  };

  const switchMode = (newMode: VerifyMode) => {
    setMode(newMode);
    setError(null);
    setVerificationCode('');
    setRecoveryCode('');
  };

  return (
    <div className="bg-surface-container flex min-h-svh flex-col items-center justify-center p-4 md:p-8">
      <div className="w-full md:max-w-5xl">
        <div className="flex flex-col gap-6">
          <Card className="overflow-hidden p-0">
            <CardContent className="grid p-0 md:grid-cols-2">
              <div className="p-6 md:p-8">
                <FieldGroup>
                  <div className="flex flex-col items-center gap-2 text-center">
                    <div className="bg-state-active text-state-active-foreground mb-2 flex h-12 w-12 items-center justify-center rounded-full">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                    </div>
                    <h1 className="text-2xl font-bold">{t('auth.mfaVerify.title')}</h1>
                    <p className="text-muted-foreground text-balance">
                      {mode === 'totp'
                        ? t('auth.mfaVerify.description')
                        : t('auth.mfaVerify.recoveryCodeDescription')}
                    </p>
                  </div>

                  {error && (
                    <div className="text-destructive text-center text-sm" role="alert">
                      {error}
                    </div>
                  )}

                  {mode === 'totp' ? (
                    <>
                      <div className="flex flex-col items-center gap-4">
                        <FieldLabel className="text-center">
                          {t('auth.mfaVerify.verificationCode')}
                        </FieldLabel>
                        <InputOTP
                          maxLength={6}
                          value={verificationCode}
                          onChange={(value) => setVerificationCode(value)}
                          onComplete={handleVerifyTotp}
                        >
                          <InputOTPGroup>
                            <InputOTPSlot index={0} />
                            <InputOTPSlot index={1} />
                            <InputOTPSlot index={2} />
                            <InputOTPSlot index={3} />
                            <InputOTPSlot index={4} />
                            <InputOTPSlot index={5} />
                          </InputOTPGroup>
                        </InputOTP>
                      </div>

                      <Field>
                        <Button
                          onClick={handleVerifyTotp}
                          disabled={verificationCode.length !== 6}
                          isLoading={isVerifying}
                          loadingText={t('auth.mfaVerify.verifying')}
                          className="w-full"
                        >
                          {t('auth.mfaVerify.verifyButton')}
                        </Button>
                      </Field>

                      <FieldDescription className="text-center">
                        {t('auth.mfaVerify.lostAccess')}{' '}
                        <button
                          type="button"
                          onClick={() => switchMode('recovery')}
                          className="hover:text-primary hover:underline"
                        >
                          {t('auth.mfaVerify.useRecoveryCode')}
                        </button>
                      </FieldDescription>
                    </>
                  ) : (
                    <>
                      <div className="flex flex-col items-center gap-4">
                        <FieldLabel className="text-center">
                          {t('auth.mfaVerify.recoveryCodeInput')}
                        </FieldLabel>
                        <Input
                          value={recoveryCode}
                          onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
                          placeholder={t('auth.mfaVerify.recoveryCodePlaceholder')}
                          className="text-center font-mono text-lg tracking-widest"
                          maxLength={9}
                          autoComplete="off"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleVerifyRecovery();
                            }
                          }}
                        />
                      </div>

                      <Field>
                        <Button
                          onClick={handleVerifyRecovery}
                          disabled={recoveryCode.trim().length === 0}
                          isLoading={isVerifying}
                          loadingText={t('auth.mfaVerify.verifying')}
                          className="w-full"
                        >
                          {t('auth.mfaVerify.useRecoveryCodeButton')}
                        </Button>
                      </Field>

                      <FieldDescription className="text-center">
                        <button
                          type="button"
                          onClick={() => switchMode('totp')}
                          className="hover:text-primary hover:underline"
                        >
                          {t('auth.mfaVerify.switchToTotp')}
                        </button>
                      </FieldDescription>
                    </>
                  )}

                  <FieldDescription className="text-center">
                    <a
                      href={`/${locale}/auth/login`}
                      className="hover:text-primary hover:underline"
                    >
                      {t('auth.mfaVerify.backToLogin')}
                    </a>
                  </FieldDescription>
                </FieldGroup>
              </div>
              <div className="bg-surface-container relative hidden md:block">
                <Image
                  src="/placeholder.svg"
                  alt="Image"
                  fill
                  className="object-cover dark:brightness-[0.2] dark:grayscale"
                />
              </div>
            </CardContent>
          </Card>
          <FieldDescription className="px-6 text-center">
            {t('auth.mfaVerify.termsAndPrivacy')}{' '}
            <a href="#">{t('auth.mfaVerify.termsOfService')}</a> {t('auth.mfaVerify.and')}{' '}
            <a href="#">{t('auth.mfaVerify.privacyPolicy')}</a>
            {t('auth.mfaVerify.agree')}
          </FieldDescription>
        </div>
      </div>
    </div>
  );
}
