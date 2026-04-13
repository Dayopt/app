'use client';

import { useState } from 'react';

import NextImage from 'next/image';

import { Link } from '@/lib/i18n/navigation';

import { Button } from '@/lib/components/ui/button';
import { Card, CardContent } from '@/lib/components/ui/card';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSupportText,
} from '@/lib/components/ui/field';
import { Input } from '@/lib/components/ui/input';
import { cn } from '@/lib/utils';
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error } = await resetPassword(email);

      if (error) {
        const errorKey = getAuthErrorKey(error.message, 'resetPassword');
        setError(t(errorKey));
      } else {
        setSuccess(true);
      }
    } catch {
      setError(t('auth.errors.unexpectedError'));
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className={cn('flex flex-col gap-6', className)} {...props}>
        <Card className="overflow-hidden p-0">
          <CardContent className="grid p-0 md:grid-cols-2">
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
            <div className="bg-container relative hidden md:block">
              <NextImage
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
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
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
              <Field>
                <Button
                  type="submit"
                  loading={loading}
                  loadingText={t('auth.passwordResetForm.sending')}
                >
                  {t('auth.passwordResetForm.sendResetLink')}
                </Button>
              </Field>
              <FieldDescription className="text-center">
                {t('auth.passwordResetForm.rememberPassword')}{' '}
                <Link href="/auth/login">{t('auth.passwordResetForm.login')}</Link>
              </FieldDescription>
            </FieldGroup>
          </form>
          <div className="bg-container relative hidden md:block">
            <NextImage
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
    </div>
  );
}
