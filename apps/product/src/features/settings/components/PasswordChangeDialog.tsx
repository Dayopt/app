'use client';

import { useCallback, useState } from 'react';

import { Eye, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useAuthStore } from '@/features/auth';
import { checkPasswordPwned } from '@/lib/auth/pwned-password';
import { logger } from '@/lib/logger';
import { observeAuthOperation } from '@/lib/sentry';
import { createClient } from '@/lib/supabase/client';
import { api } from '@/lib/trpc';
import { getDisplayName } from '@/lib/user';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from '@dayopt/components';

interface PasswordChangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function isCurrentPasswordError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('current_password') ||
    message.includes('current password') ||
    message.includes('invalid password') ||
    message.includes('incorrect password')
  );
}

/**
 * パスワード変更ダイアログ
 *
 * OWASP/NIST推奨のセキュリティチェックを含む
 */
export function PasswordChangeDialog({ open, onOpenChange }: PasswordChangeDialogProps) {
  const user = useAuthStore((state) => state.user);
  const t = useTranslations();
  const supabase = createClient();
  const { mutate: sendPasswordChangedEmail } = api.email.sendPasswordChanged.useMutation();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const resetForm = useCallback(() => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setError(null);
    setSuccess(false);
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onOpenChange(false);
  }, [onOpenChange, resetForm]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      // Validation
      if (newPassword !== confirmPassword) {
        setError(t('settings.account.passwordMismatch'));
        return;
      }
      if (newPassword.length < 8) {
        setError(t('settings.account.passwordMinLength'));
        return;
      }

      setError(null);
      setIsLoading(true);

      try {
        if (!user?.email) {
          throw new Error(t('common.errors.auth.emailNotFound'));
        }

        // Step 1: Pwned password check (NIST)
        const isPwned = await checkPasswordPwned(newPassword);
        if (isPwned) {
          throw new Error(t('settings.account.passwordPwned'));
        }

        // Step 2: Update password. 現在パスワードの検証はサーバー側が行う。
        // production の `security_update_password_require_current_password` が true のため、
        // `current_password` が一致しなければ GoTrue が拒否する（保証境界は
        // docs/product/specs/auth.md）。client 側で signInWithPassword による事前確認はしない
        // — 公開 Auth endpoint なので Bot Protection 有効時に CAPTCHA token を要求され、
        // 認証済みの設定画面から呼ぶと必ず失敗する（#1917）。
        const { error: updateError } = await observeAuthOperation('update_password', () =>
          supabase.auth.updateUser({
            password: newPassword,
            current_password: currentPassword,
          }),
        );

        if (updateError) {
          if (isCurrentPasswordError(updateError)) {
            throw new Error(t('settings.account.passwordIncorrect'));
          }
          throw new Error(updateError.message);
        }

        // Step 3: Sign out other sessions
        await observeAuthOperation('sign_out_other_sessions', () =>
          supabase.auth.signOut({ scope: 'others' }),
        );

        // Step 4: Send password changed notification email (fire-and-forget)
        sendPasswordChangedEmail({
          email: user.email,
          userName: getDisplayName(user, 'there'),
        });

        setSuccess(true);
      } catch (err) {
        logger.error('Password update error:', err);
        const errorMessage =
          err instanceof Error ? err.message : t('settings.account.passwordUpdateFailed');
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    },
    [currentPassword, newPassword, confirmPassword, user, t, supabase, sendPasswordChangedEmail],
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('settings.account.password')}</DialogTitle>
          <DialogDescription>
            {success ? t('settings.account.passwordUpdated') : t('settings.account.passwordDesc')}
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="space-y-4 py-4">
            <div className="border-success bg-success-tint rounded-2xl p-4">
              <p className="text-success text-base font-normal md:text-sm">
                {t('settings.account.passwordUpdated')}
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="current-password">{t('settings.account.currentPassword')}</Label>
                <div className="relative">
                  <Input
                    id="current-password"
                    type={showCurrentPassword ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    minLength={8}
                    maxLength={64}
                    autoComplete="current-password"
                    className="pr-8"
                    aria-invalid={!!error}
                    aria-describedby={error ? 'password-change-error' : undefined}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    icon
                    className="absolute top-1/2 right-1 -translate-y-1/2"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    aria-label={
                      showCurrentPassword
                        ? t('settings.account.hidePassword')
                        : t('settings.account.showPassword')
                    }
                  >
                    {showCurrentPassword ? (
                      <Eye className="h-4 w-4" />
                    ) : (
                      <EyeOff className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-password">{t('settings.account.newPassword')}</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={8}
                    maxLength={64}
                    autoComplete="new-password"
                    className="pr-8"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    icon
                    className="absolute top-1/2 right-1 -translate-y-1/2"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    aria-label={
                      showNewPassword
                        ? t('settings.account.hidePassword')
                        : t('settings.account.showPassword')
                    }
                  >
                    {showNewPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-muted-foreground text-xs">
                  {t('settings.account.passwordMinLength')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">{t('settings.account.confirmPassword')}</Label>
                <div className="relative">
                  <Input
                    id="confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={8}
                    maxLength={64}
                    autoComplete="new-password"
                    className="pr-8"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    icon
                    className="absolute top-1/2 right-1 -translate-y-1/2"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    aria-label={
                      showConfirmPassword
                        ? t('settings.account.hidePassword')
                        : t('settings.account.showPassword')
                    }
                  >
                    {showConfirmPassword ? (
                      <Eye className="h-4 w-4" />
                    ) : (
                      <EyeOff className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {error && (
                <div
                  id="password-change-error"
                  role="alert"
                  className="border-destructive text-destructive rounded-lg border p-4 text-base md:text-sm"
                >
                  {error}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading}>
                {t('common.actions.cancel')}
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading
                  ? t('settings.account.updatingPassword')
                  : t('settings.account.updatePassword')}
              </Button>
            </DialogFooter>
          </form>
        )}

        {success && (
          <DialogFooter>
            <Button onClick={handleClose}>{t('common.actions.close')}</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
