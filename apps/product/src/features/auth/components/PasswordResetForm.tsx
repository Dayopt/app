'use client';

import { useRef, useState } from 'react';

import { useParams } from 'next/navigation';

import { Link } from '@dayopt/i18n/navigation';

import { isTurnstileEnabled, Turnstile, type TurnstileInstance } from '@/lib/turnstile';

import {
  Button,
  Card,
  CardContent,
  cn,
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSupportText,
  Input,
} from '@dayopt/components';
import { useTranslations } from 'next-intl';
import { useAuthStore } from '../stores/useAuthStore';

import { getAuthErrorKey } from '../lib/sanitize-auth-error';

/** パスワードリセットメール送信フォーム。送信成功後は確認メッセージに切り替わる */
export function PasswordResetForm({ className, ...props }: React.ComponentProps<'div'>) {
  const t = useTranslations();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const resetPassword = useAuthStore((state) => state.resetPassword);
  const params = useParams();
  const locale = (params?.locale as string) || 'ja';
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance | null>(null);
  const turnstileEnabled = isTurnstileEnabled();
  const turnstileLocale: 'ja' | 'en' | 'auto' =
    locale === 'ja' ? 'ja' : locale === 'en' ? 'en' : 'auto';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error } = turnstileToken
        ? await resetPassword(email, { captchaToken: turnstileToken })
        : await resetPassword(email);

      if (error) {
        const errorKey = getAuthErrorKey(
          { message: error.message, code: error.code },
          'resetPassword',
        );
        setError(t(errorKey));
        // Turnstile token は single-use。失敗時は widget を reset して次の retry で
        // 新しい challenge token を取得させる
        setTurnstileToken(null);
        turnstileRef.current?.reset();
      } else {
        setSuccess(true);
      }
    } catch {
      setError(t('auth.errors.unexpectedError'));
      setTurnstileToken(null);
      turnstileRef.current?.reset();
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className={cn('flex flex-col gap-6', className)} {...props}>
        <Card className="overflow-hidden p-0">
          <CardContent className="p-0">
            <div className="p-6 md:p-8">
              <FieldGroup>
                <div className="flex flex-col items-center gap-2 text-center">
                  <h1 className="text-2xl font-medium">{t('auth.passwordResetForm.checkEmail')}</h1>
                  <p className="text-muted-foreground text-balance">
                    {t('auth.passwordResetForm.sentResetLink')}{' '}
                    <span className="font-normal">{email}</span>
                  </p>
                </div>
                <Field>
                  <Button asChild>
                    <Link href="/auth/login">{t('auth.passwordResetForm.backToLogin')}</Link>
                  </Button>
                </Field>
              </FieldGroup>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <Card className="overflow-hidden p-0">
        <CardContent className="p-0">
          <form className="p-6 md:p-8" onSubmit={handleSubmit}>
            <FieldGroup>
              <div className="flex flex-col items-center gap-2 text-center">
                <h1 className="text-2xl font-medium">
                  {t('auth.passwordResetForm.resetPassword')}
                </h1>
                <p className="text-muted-foreground text-balance">
                  {t('auth.passwordResetForm.enterEmail')}
                </p>
              </div>
              {error && (
                <FieldError announceImmediately className="text-center">
                  {error}
                </FieldError>
              )}

              <Field>
                <FieldLabel htmlFor="email" required requiredLabel={t('common.form.required')}>
                  {t('auth.passwordResetForm.email')}
                </FieldLabel>
                <FieldSupportText id="email-support">
                  {t('auth.passwordResetForm.emailSupportText')}
                </FieldSupportText>
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  enterKeyHint="send"
                  aria-disabled={loading || undefined}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  aria-describedby="email-support"
                />
              </Field>

              {turnstileEnabled && (
                <Field>
                  <div className="flex justify-center">
                    <Turnstile
                      ref={turnstileRef}
                      onSuccess={(token) => setTurnstileToken(token)}
                      onError={() => setTurnstileToken(null)}
                      onExpire={() => setTurnstileToken(null)}
                      locale={turnstileLocale}
                    />
                  </div>
                </Field>
              )}

              <Field>
                <Button
                  type="submit"
                  loading={loading}
                  loadingText={t('auth.passwordResetForm.sending')}
                  disabled={turnstileEnabled && !turnstileToken}
                >
                  {t('auth.passwordResetForm.sendResetLink')}
                </Button>
              </Field>
              <FieldDescription className="text-center">
                {t('auth.passwordResetForm.googleHint')}
              </FieldDescription>
              <FieldDescription className="text-center">
                {t('auth.passwordResetForm.rememberPassword')}{' '}
                <Link href="/auth/login">{t('auth.passwordResetForm.login')}</Link>
              </FieldDescription>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
