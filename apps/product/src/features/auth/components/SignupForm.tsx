'use client';

import { useRef, useState } from 'react';

import { createDayoptUrl, dayoptUrls } from '@dayopt/config';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Mail } from 'lucide-react';
import { useTranslations } from 'next-intl';
import NextImage from 'next/image';
import { useParams, useRouter } from 'next/navigation';

import { Link } from '@dayopt/i18n/navigation';
import { useForm } from 'react-hook-form';

import { logger } from '@/lib/logger';
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
  FieldSeparator,
  FieldSupportText,
  HoverTooltip,
  Input,
} from '@dayopt/components';
import { useAuthStore } from '../stores/useAuthStore';

import { getAuthErrorKey } from '../lib/sanitize-auth-error';
import { signupSchema, type SignupFormData } from '../schemas/auth.schema';

/**
 * 漏洩パスワードチェック（オプショナル）
 * Have I Been Pwned APIが利用できない場合はfalseを返す
 */
async function safeCheckPasswordPwned(password: string): Promise<boolean> {
  try {
    // 動的インポートでエラーハンドリングを強化
    const { checkPasswordPwned } = await import('@/lib/auth/pwned-password');
    return await checkPasswordPwned(password);
  } catch (err) {
    logger.warn('[SignupForm] Pwned password check failed, skipping:', err);
    return false;
  }
}

/**
 * SignupForm - 堅牢なサインアップフォームコンポーネント
 *
 * 設計原則:
 * 1. 最小依存: メール・パスワードでのサインアップは外部サービスなしで動作
 * 2. グレースフルデグラデーション: Have I Been Pwned API等が失敗してもサインアップ可能
 * 3. クライアントサイドバリデーション: パスワード長
 */
export function SignupForm({ className, ...props }: React.ComponentProps<'div'>) {
  const params = useParams();
  const router = useRouter();
  const locale = (params?.locale as string) || 'ja';
  const t = useTranslations();
  const signUp = useAuthStore((state) => state.signUp);
  const signInWithOAuth = useAuthStore((state) => state.signInWithOAuth);

  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const handleOAuthSignup = async (provider: 'google' | 'apple') => {
    setServerError(null);
    try {
      const { error } = await signInWithOAuth(provider);
      if (error) {
        setServerError(t('auth.errors.unexpectedError'));
      }
    } catch (err) {
      logger.error(`[SignupForm] OAuth ${provider} error:`, err);
      setServerError(t('auth.errors.unexpectedError'));
    }
  };
  const [emailConfirmationPending, setEmailConfirmationPending] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance | null>(null);
  const turnstileEnabled = isTurnstileEnabled();
  const turnstileLocale: 'ja' | 'en' | 'auto' =
    locale === 'ja' ? 'ja' : locale === 'en' ? 'en' : 'auto';

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupFormData>({
    // monorepo (pnpm) で apps/product(zod3) と apps/web(zod4) を併存させているため、
    // @hookform/resolvers の zod adapter が strict 隔離下で型解決できない。
    // ランタイムは正常。zod version 統一は follow-up PR で対応する。
    resolver: zodResolver(signupSchema as never),
    defaultValues: {
      email: '',
      password: '',
    },
    mode: 'onSubmit', // DADS準拠: 送信時バリデーション
  });

  const onSubmit = async (data: SignupFormData) => {
    setServerError(null);

    // 漏洩パスワードチェック（オプショナル - Have I Been Pwned API）
    const isPwned = await safeCheckPasswordPwned(data.password);
    if (isPwned) {
      setServerError(t('auth.errors.pwnedPassword'));
      return;
    }

    try {
      const result = turnstileToken
        ? await signUp(data.email, data.password, { captchaToken: turnstileToken })
        : await signUp(data.email, data.password);
      if (result.error) {
        const errorKey = getAuthErrorKey(result.error.message, 'signup');
        setServerError(t(errorKey));
        // Turnstile token は single-use / short-lived。失敗時は widget を reset して次の retry で
        // 新しい challenge token を取得させる（captcha 使い回しによる連続失敗を防ぐ）
        setTurnstileToken(null);
        turnstileRef.current?.reset();
      } else if (result.data.session) {
        // メール確認不要 — そのままアプリへ
        router.push(`/${locale}/week`);
      } else {
        // メール確認が必要 — 確認待ちUIを表示
        setPendingEmail(data.email);
        setEmailConfirmationPending(true);
      }
    } catch (err) {
      logger.error('[SignupForm] Signup error:', err);
      setServerError(t('auth.errors.unexpectedError'));
      setTurnstileToken(null);
      turnstileRef.current?.reset();
    }
  };

  if (emailConfirmationPending) {
    return (
      <div className={cn('flex flex-col gap-6', className)} {...props}>
        <Card className="overflow-hidden p-0">
          <CardContent className="flex flex-col items-center gap-4 p-6 text-center md:p-8">
            <div className="bg-muted flex size-10 items-center justify-center rounded-full">
              <Mail className="text-muted-foreground size-5" />
            </div>
            <h1 className="text-2xl font-medium">{t('auth.signupForm.checkEmail')}</h1>
            <p className="text-muted-foreground text-sm">
              {t('auth.signupForm.confirmationSent', { email: pendingEmail })}
            </p>
            <Link href="/auth/login" className="text-primary text-sm underline underline-offset-4">
              {t('auth.signupForm.backToLogin')}
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          {/* eslint-disable-next-line react-hooks/refs -- onSubmit は submit 時のみ turnstileRef.current を読む event handler。handleSubmit(onSubmit) の closure 解析による誤検知を抑制 */}
          <form className="p-6 md:p-8" onSubmit={handleSubmit(onSubmit)}>
            <FieldGroup>
              <div className="flex flex-col items-center text-center">
                <h1 className="text-2xl font-medium">{t('auth.signupForm.createAccount')}</h1>
              </div>

              {serverError && (
                <FieldError announceImmediately className="text-center">
                  {serverError}
                </FieldError>
              )}

              <Field className="grid grid-cols-3 gap-4">
                <Button
                  variant="outline"
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleOAuthSignup('apple')}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                    <path
                      d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"
                      fill="currentColor"
                    />
                  </svg>
                  <span className="sr-only">{t('auth.signupForm.signupWithApple')}</span>
                </Button>
                <Button
                  variant="outline"
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleOAuthSignup('google')}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                    <path
                      d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
                      fill="currentColor"
                    />
                  </svg>
                  <span className="sr-only">{t('auth.signupForm.signupWithGoogle')}</span>
                </Button>
                {/* Meta OAuth は Supabase 未対応のため一時的に disable */}
                <Button variant="outline" type="button" disabled aria-disabled>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                    <path
                      d="M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973a6.624 6.624 0 0 0 .265.86 5.297 5.297 0 0 0 .371.761c.696 1.159 1.818 1.927 3.593 1.927 1.497 0 2.633-.671 3.965-2.444.76-1.012 1.144-1.626 2.663-4.32l.756-1.339.186-.325c.061.1.121.196.183.3l2.152 3.595c.724 1.21 1.665 2.556 2.47 3.314 1.046.987 1.992 1.22 3.06 1.22 1.075 0 1.876-.355 2.455-.843a3.743 3.743 0 0 0 .81-.973c.542-.939.861-2.127.861-3.745 0-2.72-.681-5.357-2.084-7.45-1.282-1.912-2.957-2.93-4.716-2.93-1.047 0-2.088.467-3.053 1.308-.652.57-1.257 1.29-1.82 2.05-.69-.875-1.335-1.547-1.958-2.056-1.182-.966-2.315-1.303-3.454-1.303zm10.16 2.053c1.147 0 2.188.758 2.992 1.999 1.132 1.748 1.647 4.195 1.647 6.4 0 1.548-.368 2.9-1.839 2.9-.58 0-1.027-.23-1.664-1.004-.496-.601-1.343-1.878-2.832-4.358l-.617-1.028a44.908 44.908 0 0 0-1.255-1.98c.07-.109.141-.224.211-.327 1.12-1.667 2.118-2.602 3.358-2.602zm-8.201.553c1.265 0 2.058.791 2.675 1.446.307.327.737.871 1.234 1.579l-1.02 1.566c-.757 1.163-1.882 3.017-2.837 4.338-1.191 1.649-1.81 1.817-2.486 1.817-.524 0-1.038-.237-1.383-.794-.263-.426-.464-1.13-.464-2.046 0-2.221.63-4.535 1.66-6.088.454-.687.964-1.226 1.533-1.533a2.264 2.264 0 0 1 1.088-.285z"
                      fill="currentColor"
                    />
                  </svg>
                  <span className="sr-only">{t('auth.signupForm.signupWithMeta')}</span>
                </Button>
              </Field>

              <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card">
                {t('auth.signupForm.orContinueWith')}
              </FieldSeparator>

              <Field>
                <FieldLabel htmlFor="email" required requiredLabel={t('common.form.required')}>
                  {t('auth.signupForm.email')}
                </FieldLabel>
                <FieldSupportText id="email-support">
                  {t('auth.signupForm.emailSupportText')}
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
                {errors.email?.message && (
                  <FieldError id="email-error">{t(errors.email.message)}</FieldError>
                )}
              </Field>

              <Field>
                <FieldLabel htmlFor="password" required requiredLabel={t('common.form.required')}>
                  {t('auth.signupForm.password')}
                </FieldLabel>
                <FieldSupportText id="password-support">
                  {t('auth.signupForm.passwordSupportText')}
                </FieldSupportText>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    enterKeyHint="go"
                    aria-disabled={isSubmitting || undefined}
                    autoComplete="new-password"
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
                      aria-disabled={isSubmitting || undefined}
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
                {errors.password?.message && (
                  <FieldError id="password-error">{t(errors.password.message)}</FieldError>
                )}
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
                  loading={isSubmitting}
                  disabled={turnstileEnabled && !turnstileToken}
                  className="w-full"
                >
                  {t('auth.signupForm.createAccountButton')}
                </Button>
                <p className="text-muted-foreground text-center text-xs leading-relaxed">
                  {t('auth.signupForm.byContinuing')}{' '}
                  <a
                    href={createDayoptUrl(dayoptUrls.marketing, '/legal/terms')}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-foreground underline underline-offset-4"
                  >
                    {t('auth.signupForm.termsOfService')}
                  </a>{' '}
                  {t('auth.signupForm.and')}{' '}
                  <a
                    href={createDayoptUrl(dayoptUrls.marketing, '/legal/privacy')}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-foreground underline underline-offset-4"
                  >
                    {t('auth.signupForm.privacyPolicy')}
                  </a>
                  {t('auth.signupForm.agree')}
                </p>
              </Field>

              <FieldDescription className="text-center">
                {t('auth.signupForm.alreadyHaveAccount')}{' '}
                <Link href="/auth/login">{t('auth.signupForm.login')}</Link>
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
