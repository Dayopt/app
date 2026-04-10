'use client';

import { useCallback, useEffect, useState } from 'react';

import { Check, Eye, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import NextImage from 'next/image';
import { useParams, useRouter, useSearchParams } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { HoverTooltip } from '@/components/ui/tooltip';
import { Link } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

import { useAuthStore } from '@/stores/useAuthStore';
import { getAuthErrorKey } from '../lib/sanitize-auth-error';

/** 新しいパスワード設定フォーム。URLのaccess_token/refresh_tokenを利用してパスワードを更新する */
export function ResetPasswordForm({ className, ...props }: React.ComponentProps<'div'>) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams();
  const locale = (params?.locale as string) || 'ja';
  const t = useTranslations();
  const updatePassword = useAuthStore((state) => state.updatePassword);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const accessToken = searchParams?.get('access_token') ?? null;
  const refreshToken = searchParams?.get('refresh_token') ?? null;

  useEffect(() => {
    if (!accessToken || !refreshToken) {
      router.push(`/${locale}/auth`);
    }
  }, [accessToken, refreshToken, router, locale]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      setError(null);

      if (password !== confirmPassword) {
        setError(t('auth.resetPasswordForm.passwordMismatch'));
        setLoading(false);
        return;
      }

      if (password.length < 12) {
        setError(t('auth.resetPasswordForm.passwordTooShort'));
        setLoading(false);
        return;
      }

      try {
        const { error } = await updatePassword(password);

        if (error) {
          const errorKey = getAuthErrorKey(error.message, 'updatePassword');
          setError(t(errorKey));
        } else {
          setSuccess(true);
          setTimeout(() => {
            router.push(`/${locale}/auth/login`);
          }, 3000);
        }
      } catch {
        setError(t('auth.resetPasswordForm.updateError'));
      } finally {
        setLoading(false);
      }
    },
    [password, confirmPassword, updatePassword, router, locale, t],
  );

  if (success) {
    return (
      <div className={cn('flex flex-col gap-6', className)} {...props}>
        <Card className="overflow-hidden p-0">
          <CardContent className="grid p-0 md:grid-cols-2">
            <div className="p-6 md:p-8">
              <FieldGroup>
                <div className="flex flex-col items-center gap-2 text-center">
                  <div className="bg-state-active text-state-active-foreground mb-2 flex h-12 w-12 items-center justify-center rounded-full">
                    <Check className="h-6 w-6" />
                  </div>
                  <h1 className="text-2xl font-medium">
                    {t('auth.resetPasswordForm.successTitle')}
                  </h1>
                  <p className="text-muted-foreground text-balance">
                    {t('auth.resetPasswordForm.successMessage')}
                  </p>
                </div>
              </FieldGroup>
            </div>
            <div className="bg-container relative hidden md:block">
              <NextImage
                src="/images/placeholder.svg"
                alt="Decorative background"
                fill
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
                <h1 className="text-2xl font-medium">{t('auth.resetPasswordForm.title')}</h1>
                <p className="text-muted-foreground text-balance">
                  {t('auth.resetPasswordForm.description')}
                </p>
              </div>

              {error && (
                <FieldError announceImmediately className="text-center">
                  {error}
                </FieldError>
              )}

              <Field>
                <FieldLabel htmlFor="password">
                  {t('auth.resetPasswordForm.newPassword')}
                </FieldLabel>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-disabled={loading || undefined}
                    autoComplete="new-password"
                    required
                    minLength={12}
                  />
                  <HoverTooltip
                    content={
                      showPassword
                        ? t('auth.signupForm.hidePassword')
                        : t('auth.signupForm.showPassword')
                    }
                    side="top"
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      icon
                      className="absolute top-0 right-0 h-full px-4"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-disabled={loading || undefined}
                      aria-label={
                        showPassword
                          ? t('auth.signupForm.hidePassword')
                          : t('auth.signupForm.showPassword')
                      }
                    >
                      {showPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </Button>
                  </HoverTooltip>
                </div>
              </Field>

              <Field>
                <FieldLabel htmlFor="confirmPassword">
                  {t('auth.resetPasswordForm.confirmPassword')}
                </FieldLabel>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    aria-disabled={loading || undefined}
                    autoComplete="new-password"
                    required
                    minLength={12}
                  />
                  <HoverTooltip
                    content={
                      showConfirmPassword
                        ? t('auth.signupForm.hidePassword')
                        : t('auth.signupForm.showPassword')
                    }
                    side="top"
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      icon
                      className="absolute top-0 right-0 h-full px-4"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      aria-disabled={loading || undefined}
                      aria-label={
                        showConfirmPassword
                          ? t('auth.signupForm.hidePassword')
                          : t('auth.signupForm.showPassword')
                      }
                    >
                      {showConfirmPassword ? (
                        <Eye className="h-4 w-4" />
                      ) : (
                        <EyeOff className="h-4 w-4" />
                      )}
                    </Button>
                  </HoverTooltip>
                </div>
              </Field>

              <Field>
                <Button
                  type="submit"
                  loading={loading}
                  loadingText={t('auth.resetPasswordForm.updating')}
                  className="w-full"
                >
                  {t('auth.resetPasswordForm.updateButton')}
                </Button>
              </Field>

              <FieldDescription className="text-center">
                <Link href="/auth/login">{t('auth.resetPasswordForm.backToLogin')}</Link>
              </FieldDescription>
            </FieldGroup>
          </form>
          <div className="bg-container relative hidden md:block">
            <NextImage
              src="/images/placeholder.svg"
              alt="Decorative background"
              fill
              sizes="(min-width: 768px) 50vw, 0vw"
              className="object-cover dark:brightness-20 dark:grayscale"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
