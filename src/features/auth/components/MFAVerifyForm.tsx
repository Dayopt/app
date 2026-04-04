'use client';

import { useTranslations } from 'next-intl';
import Image from 'next/image';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';

type VerifyMode = 'totp' | 'recovery';

interface MFAVerifyFormProps {
  mode: VerifyMode;
  verificationCode: string;
  onVerificationCodeChange: (value: string) => void;
  recoveryCode: string;
  onRecoveryCodeChange: (value: string) => void;
  isVerifying: boolean;
  error: string | null;
  onVerifyTotp: () => void;
  onVerifyRecovery: () => void;
  onSwitchMode: (mode: VerifyMode) => void;
  loginHref: string;
}

export function MFAVerifyForm({
  mode,
  verificationCode,
  onVerificationCodeChange,
  recoveryCode,
  onRecoveryCodeChange,
  isVerifying,
  error,
  onVerifyTotp,
  onVerifyRecovery,
  onSwitchMode,
  loginHref,
}: MFAVerifyFormProps) {
  const t = useTranslations();

  return (
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
                    aria-hidden="true"
                  >
                    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <h1 className="text-2xl font-medium">{t('auth.mfaVerify.title')}</h1>
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
                      onChange={onVerificationCodeChange}
                      onComplete={onVerifyTotp}
                      aria-label={t('auth.mfaVerify.verificationCode')}
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
                      onClick={onVerifyTotp}
                      disabled={verificationCode.length !== 6}
                      loading={isVerifying}
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
                      onClick={() => onSwitchMode('recovery')}
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
                      onChange={(e) => onRecoveryCodeChange(e.target.value.toUpperCase())}
                      placeholder={t('auth.mfaVerify.recoveryCodePlaceholder')}
                      className="text-center font-mono text-lg tracking-widest"
                      maxLength={9}
                      autoComplete="off"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          onVerifyRecovery();
                        }
                      }}
                    />
                  </div>

                  <Field>
                    <Button
                      onClick={onVerifyRecovery}
                      disabled={recoveryCode.trim().length === 0}
                      loading={isVerifying}
                      loadingText={t('auth.mfaVerify.verifying')}
                      className="w-full"
                    >
                      {t('auth.mfaVerify.useRecoveryCodeButton')}
                    </Button>
                  </Field>

                  <FieldDescription className="text-center">
                    <button
                      type="button"
                      onClick={() => onSwitchMode('totp')}
                      className="hover:text-primary hover:underline"
                    >
                      {t('auth.mfaVerify.switchToTotp')}
                    </button>
                  </FieldDescription>
                </>
              )}

              <FieldDescription className="text-center">
                <a href={loginHref} className="hover:text-primary hover:underline">
                  {t('auth.mfaVerify.backToLogin')}
                </a>
              </FieldDescription>
            </FieldGroup>
          </div>
          <div className="bg-surface-container relative hidden md:block">
            <Image
              src="/images/placeholder.svg"
              alt="Decorative background"
              fill
              loading="lazy"
              sizes="(min-width: 768px) 50vw, 0vw"
              className="object-cover dark:brightness-20 dark:grayscale"
            />
          </div>
        </CardContent>
      </Card>
      <FieldDescription className="px-6 text-center">
        {t('auth.mfaVerify.termsAndPrivacy')} <a href="#">{t('auth.mfaVerify.termsOfService')}</a>{' '}
        {t('auth.mfaVerify.and')} <a href="#">{t('auth.mfaVerify.privacyPolicy')}</a>
        {t('auth.mfaVerify.agree')}
      </FieldDescription>
    </div>
  );
}
