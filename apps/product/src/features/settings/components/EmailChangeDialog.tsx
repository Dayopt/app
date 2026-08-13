'use client';

import { useState } from 'react';

import { useTranslations } from 'next-intl';

import { getAuthErrorKey } from '@/lib/auth-error';
import { observeAuthOperation } from '@/lib/sentry';
import { createClient } from '@/lib/supabase/client';
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
import { InfoBox } from './InfoBox';

interface EmailChangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentEmail: string;
}

/**
 * メールアドレス変更ダイアログ。
 *
 * 本人確認は Supabase Auth の Secure Email Change（旧・新アドレス双方への確認メール）が担う。
 * ここで `signInWithPassword` による再認証はしない。公開 Auth endpoint なので Bot Protection
 * 有効時は CAPTCHA token を要求され、認証済みの設定画面から呼ぶと必ず失敗する（#1917）。
 *
 * この画面の本人確認は production の `mailer_secure_email_change_enabled` に単独で依存する。
 * 保証境界は docs/product/specs/auth.md を参照。
 */
export function EmailChangeDialog({ open, onOpenChange, currentEmail }: EmailChangeDialogProps) {
  const t = useTranslations('settings.account.emailChange');
  const tErrors = useTranslations('common.errors');
  const tRoot = useTranslations();
  const [newEmail, setNewEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      // メールアドレス更新（Secure Email Change により旧・新アドレスの双方へ確認メールが飛ぶ）
      // リンクは send-auth-email hook が /auth/confirm 経由の URL に変換し、
      // verifyOtp 成功後にこの emailRedirectTo の path へ着地する
      const { error: updateError } = await observeAuthOperation('update_email', () =>
        supabase.auth.updateUser(
          { email: newEmail },
          {
            emailRedirectTo: `${window.location.origin}/settings/account`,
          },
        ),
      );

      if (updateError) {
        // 生のエラーメッセージは出さず、OWASP 準拠のサニタイズ済みキーへ変換する。
        // context は 'updatePassword' を使う（signup 固有の actionable な文言
        // （#2027、「既にアカウントをお持ちの場合はログイン」等）は email 更新には合わない。
        // updatePassword は weak/short 以外を全て unexpectedError に畳むため、
        // email 衝突エラーも含めて汎用文言のまま隠せる）
        throw new Error(
          tRoot(
            getAuthErrorKey(
              { message: updateError.message, code: updateError.code },
              'updatePassword',
            ),
          ),
        );
      }

      // 成功
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : tErrors('generic'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setNewEmail('');
    setError(null);
    setSuccess(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{success ? t('successTitle') : t('description')}</DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="space-y-4 py-4">
            <InfoBox>
              <p className="text-base md:text-sm">{t('successMessage', { email: newEmail })}</p>
              <p className="text-muted-foreground mt-2 text-xs">{t('successHint')}</p>
            </InfoBox>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="current-email">{t('currentEmail')}</Label>
                <Input
                  id="current-email"
                  type="email"
                  value={currentEmail}
                  disabled
                  className="bg-muted"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-email">{t('newEmail')}</Label>
                <Input
                  id="new-email"
                  type="email"
                  inputMode="email"
                  enterKeyHint="go"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="new@example.com"
                  required
                  autoComplete="email"
                  aria-invalid={!!error}
                  aria-describedby={error ? 'email-change-error' : undefined}
                />
              </div>

              {error && (
                <div
                  id="email-change-error"
                  role="alert"
                  className="border-destructive text-destructive rounded-lg border p-4 text-base md:text-sm"
                >
                  {error}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading}>
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? t('submitting') : t('submit')}
              </Button>
            </DialogFooter>
          </form>
        )}

        {success && (
          <DialogFooter>
            <Button onClick={handleClose}>{t('close')}</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
