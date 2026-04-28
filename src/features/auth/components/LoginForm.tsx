'use client';

import { useMemo, useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useParams, useRouter, useSearchParams } from 'next/navigation';

import { Link } from '@/lib/i18n/navigation';
import { useForm } from 'react-hook-form';

import { Button } from '@/lib/components/ui/button';
import { Card, CardContent } from '@/lib/components/ui/card';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
  FieldSupportText,
} from '@/lib/components/ui/field';
import { Input } from '@/lib/components/ui/input';
import { HoverTooltip } from '@/lib/components/ui/tooltip';
import { logger } from '@/lib/logger';
import { getSafeRedirectPath } from '@/lib/safe-redirect';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { useAuthStore } from '../stores/useAuthStore';

import { getAuthErrorKey } from '../lib/sanitize-auth-error';
import { loginSchema, type LoginFormData } from '../schemas/auth.schema';

/**
 * LoginForm - 堅牢なログインフォームコンポーネント
 *
 * 設計原則:
 * 1. 最小依存: メール・パスワードでのログインは外部サービス（tRPC, reCAPTCHA）なしで動作
 * 2. グレースフルデグラデーション: DB/APIエラー時もフォーム表示・送信は可能
 * 3. オプショナル強化: ロックアウト・reCAPTCHA等は追加機能として後から有効化可能
 */
export function LoginForm({ className, ...props }: React.ComponentProps<'div'>) {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = (params?.locale as string) || 'ja';
  const t = useTranslations();
  const signIn = useAuthStore((state) => state.signIn);
  const redirectPath = getSafeRedirectPath(searchParams?.get('redirect'));

  const [showPassword, setShowPassword] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // OAuth/メール確認 callback 失敗時、callback route が ?error= を付けて redirect する。
  // ユーザーに無言バウンスさせず、対応するメッセージを表示する。
  const queryError = useMemo(() => {
    const errorParam = searchParams?.get('error');
    if (!errorParam) return null;
    const errorKeyMap: Record<string, string> = {
      auth_callback_error: 'auth.errors.oauthCallbackError',
      auth_callback_missing_code: 'auth.errors.oauthCallbackMissingCode',
    };
    return t(errorKeyMap[errorParam] ?? 'auth.errors.unexpectedError');
  }, [searchParams, t]);

  const serverError = submitError ?? queryError;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setSubmitError(null);

    try {
      // ステップ1: ログイン試行（最小依存で実行）
      const { error: signInError, data: signInData } = await signIn(data.email, data.password);

      if (signInError) {
        // ログイン失敗時: OWASP準拠でサニタイズ済みメッセージを表示
        const errorKey = getAuthErrorKey(signInError.message, 'login');
        setSubmitError(t(errorKey));
      } else if (signInData) {
        // ログイン成功

        // MFAチェック（セキュリティ上必須 - エラー時もMFA画面へ誘導）
        const supabase = createClient();
        const { data: aalData, error: mfaError } =
          await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

        // MFA検証画面へのリダイレクトURL構築
        // MFAVerifyPage は searchParams.get('next') でlocale付きパスを受け取る
        const fullRedirectPath = `/${locale}${redirectPath}`;
        const buildMfaUrl = () => {
          const base = `/${locale}/auth/mfa-verify`;
          return redirectPath !== '/calendar/day'
            ? `${base}?next=${encodeURIComponent(fullRedirectPath)}`
            : base;
        };

        // MFAが必要な場合、またはMFAチェックに失敗した場合
        // → MFA検証画面へ（エラー時にバイパスさせない）
        if (mfaError) {
          logger.warn(
            '[LoginForm] MFA check failed, redirecting to MFA verify for safety:',
            mfaError,
          );
          router.push(buildMfaUrl());
          return;
        }

        if (aalData?.currentLevel === 'aal1' && aalData?.nextLevel === 'aal2') {
          router.push(buildMfaUrl());
          return;
        }

        router.push(fullRedirectPath);
      }
    } catch (err) {
      logger.error('[LoginForm] Unexpected error:', err);
      setSubmitError(t('auth.errors.unexpectedError') || 'An unexpected error occurred');
    }
  };

  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          <form className="p-6 md:p-8" onSubmit={handleSubmit(onSubmit)}>
            <FieldGroup>
              <div className="flex flex-col items-center text-center">
                <h1 className="text-2xl font-medium">{t('auth.loginForm.welcomeBack')}</h1>
              </div>

              {serverError && (
                <FieldError announceImmediately className="text-center">
                  {serverError}
                </FieldError>
              )}

              <Field className="grid grid-cols-3 gap-4">
                <Button variant="outline" type="button" disabled={isSubmitting}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                    <path
                      d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"
                      fill="currentColor"
                    />
                  </svg>
                  <span className="sr-only">{t('auth.loginForm.loginWithApple')}</span>
                </Button>
                <Button variant="outline" type="button" disabled={isSubmitting}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                    <path
                      d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
                      fill="currentColor"
                    />
                  </svg>
                  <span className="sr-only">{t('auth.loginForm.loginWithGoogle')}</span>
                </Button>
                <Button variant="outline" type="button" disabled={isSubmitting}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                    <path
                      d="M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973a6.624 6.624 0 0 0 .265.86 5.297 5.297 0 0 0 .371.761c.696 1.159 1.818 1.927 3.593 1.927 1.497 0 2.633-.671 3.965-2.444.76-1.012 1.144-1.626 2.663-4.32l.756-1.339.186-.325c.061.1.121.196.183.3l2.152 3.595c.724 1.21 1.665 2.556 2.47 3.314 1.046.987 1.992 1.22 3.06 1.22 1.075 0 1.876-.355 2.455-.843a3.743 3.743 0 0 0 .81-.973c.542-.939.861-2.127.861-3.745 0-2.72-.681-5.357-2.084-7.45-1.282-1.912-2.957-2.93-4.716-2.93-1.047 0-2.088.467-3.053 1.308-.652.57-1.257 1.29-1.82 2.05-.69-.875-1.335-1.547-1.958-2.056-1.182-.966-2.315-1.303-3.454-1.303zm10.16 2.053c1.147 0 2.188.758 2.992 1.999 1.132 1.748 1.647 4.195 1.647 6.4 0 1.548-.368 2.9-1.839 2.9-.58 0-1.027-.23-1.664-1.004-.496-.601-1.343-1.878-2.832-4.358l-.617-1.028a44.908 44.908 0 0 0-1.255-1.98c.07-.109.141-.224.211-.327 1.12-1.667 2.118-2.602 3.358-2.602zm-8.201.553c1.265 0 2.058.791 2.675 1.446.307.327.737.871 1.234 1.579l-1.02 1.566c-.757 1.163-1.882 3.017-2.837 4.338-1.191 1.649-1.81 1.817-2.486 1.817-.524 0-1.038-.237-1.383-.794-.263-.426-.464-1.13-.464-2.046 0-2.221.63-4.535 1.66-6.088.454-.687.964-1.226 1.533-1.533a2.264 2.264 0 0 1 1.088-.285z"
                      fill="currentColor"
                    />
                  </svg>
                  <span className="sr-only">{t('auth.loginForm.loginWithMeta')}</span>
                </Button>
              </Field>

              <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card">
                {t('auth.loginForm.orContinueWith')}
              </FieldSeparator>

              <Field>
                <FieldLabel htmlFor="email" required requiredLabel={t('common.form.required')}>
                  {t('auth.loginForm.email')}
                </FieldLabel>
                <FieldSupportText id="email-support">
                  {t('auth.loginForm.emailSupportText')}
                </FieldSupportText>
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  enterKeyHint="next"
                  aria-disabled={isSubmitting || undefined}
                  autoComplete="email"
                  aria-invalid={!!errors.email}
                  aria-describedby={
                    [errors.email ? 'email-error' : null, 'email-support']
                      .filter(Boolean)
                      .join(' ') || undefined
                  }
                  {...register('email')}
                />
                {errors.email && <FieldError id="email-error">{errors.email.message}</FieldError>}
              </Field>

              <Field>
                <div className="flex items-center">
                  <FieldLabel htmlFor="password" required requiredLabel={t('common.form.required')}>
                    {t('auth.loginForm.password')}
                  </FieldLabel>
                  <Link
                    href="/auth/password"
                    className="text-muted-foreground hover:text-foreground ml-auto text-sm underline underline-offset-4"
                  >
                    {t('auth.loginForm.forgotPassword')}
                  </Link>
                </div>
                <FieldSupportText id="password-support">
                  {t('auth.loginForm.passwordSupportText')}
                </FieldSupportText>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    enterKeyHint="go"
                    aria-disabled={isSubmitting || undefined}
                    autoComplete="current-password"
                    aria-invalid={!!errors.password}
                    aria-describedby={
                      [errors.password ? 'password-error' : null, 'password-support']
                        .filter(Boolean)
                        .join(' ') || undefined
                    }
                    {...register('password')}
                  />
                  <HoverTooltip
                    content={
                      showPassword
                        ? t('auth.loginForm.hidePassword')
                        : t('auth.loginForm.showPassword')
                    }
                    side="top"
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      icon
                      className="absolute top-0 right-0 h-full px-4"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-disabled={isSubmitting || undefined}
                      aria-label={
                        showPassword
                          ? t('auth.loginForm.hidePassword')
                          : t('auth.loginForm.showPassword')
                      }
                    >
                      {showPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </Button>
                  </HoverTooltip>
                </div>
                {errors.password && (
                  <FieldError id="password-error">{errors.password.message}</FieldError>
                )}
              </Field>

              <Field>
                <Button type="submit" loading={isSubmitting} className="w-full">
                  {t('auth.loginForm.loginButton')}
                </Button>
              </Field>

              <FieldDescription className="text-center">
                {t('auth.loginForm.noAccount')}{' '}
                <Link href="/auth/signup">{t('auth.loginForm.signUp')}</Link>
              </FieldDescription>
            </FieldGroup>
          </form>
          <div className="bg-container relative hidden md:block">
            {/* LCP改善: デコレーション用画像はlazy load（-500ms） */}
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
    </div>
  );
}
