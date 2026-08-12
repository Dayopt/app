'use client';

import { useCallback, useState } from 'react';

import { Check, Eye, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';

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
  HoverTooltip,
  Input,
} from '@dayopt/components';
import { Link } from '@dayopt/i18n/navigation';

import { resolveSchemaMessageKey } from '../lib/resolve-schema-message-key';
import { getAuthErrorKey } from '../lib/sanitize-auth-error';
import { passwordSchema } from '../schemas/auth.schema';
import { useAuthStore } from '../stores/useAuthStore';

/**
 * GoTrue が「本人確認が recovery session だけでは足りない」を示しているか。
 *
 * - `insufficient_aal`: アカウントに MFA(TOTP) が有効。recovery session は aal1 止まりで、
 *   GoTrue が config に関わらず更新を拒否する（step-up 検証の実装は #2013 で別途追う）
 * - `current_password_required` / `current_password_mismatch`: recovery session でない
 *   セッション（通常ログイン中の直接アクセス等）でこの画面に来た
 * - `reauthentication_needed`: production では現状発生しないが、設定 drift への保険
 *
 * 汎用の「時間をおいて再試行」に畳むと、再試行しても直らない状況で誤った案内になる。
 * 構造化 code を優先し、message の substring 判定は使わない（`PasswordChangeDialog.tsx`
 * の `isCurrentPasswordError` と同じ設計）。
 */
const RECOVERY_UPDATE_BLOCKED_CODES = new Set([
  'current_password_required',
  'current_password_mismatch',
  'reauthentication_needed',
]);

function errorCode(error: unknown): string | undefined {
  return error !== null && typeof error === 'object' && 'code' in error
    ? ((error as { code?: unknown }).code as string | undefined)
    : undefined;
}

function isMfaBlocked(error: unknown): boolean {
  return errorCode(error) === 'insufficient_aal';
}

function isRecoverySessionInvalid(error: unknown): boolean {
  const code = errorCode(error);
  return typeof code === 'string' && RECOVERY_UPDATE_BLOCKED_CODES.has(code);
}

/**
 * 新しいパスワード設定フォーム。
 * recovery リンクは /auth/confirm の verifyOtp でセッション確立済みで着地する前提
 * （セッション無しの直接アクセスは page.tsx がサーバー側で弾く）
 */
export function ResetPasswordForm({ className, ...props }: React.ComponentProps<'div'>) {
  const router = useRouter();
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

      // signup / パスワード変更と同一のポリシー（8-64文字）を適用する
      const parsed = passwordSchema.safeParse(password);
      if (!parsed.success) {
        setError(t(resolveSchemaMessageKey(parsed.error.issues[0]?.message)));
        setLoading(false);
        return;
      }

      try {
        const { error } = await updatePassword(password);

        if (error) {
          const errorKey = isMfaBlocked(error)
            ? 'auth.errors.recoveryMfaBlocked'
            : isRecoverySessionInvalid(error)
              ? 'auth.errors.recoverySessionInvalid'
              : getAuthErrorKey(error.message, 'updatePassword');
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
          <CardContent className="p-0">
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
                    minLength={8}
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
                    minLength={8}
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
        </CardContent>
      </Card>
    </div>
  );
}
