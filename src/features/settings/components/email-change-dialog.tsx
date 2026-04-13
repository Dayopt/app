'use client';

import { useState } from 'react';

import { useTranslations } from 'next-intl';

import { Button } from '@/lib/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/lib/components/ui/dialog';
import { Input } from '@/lib/components/ui/input';
import { Label } from '@/lib/components/ui/label';
import { createClient } from '@/lib/supabase/client';
import { InfoBox } from './InfoBox';

interface EmailChangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentEmail: string;
}

/** メールアドレス変更ダイアログ。現在のパスワードで再認証後、確認メールを送信する */
export function EmailChangeDialog({ open, onOpenChange, currentEmail }: EmailChangeDialogProps) {
  const t = useTranslations('settings.account.emailChange');
  const tErrors = useTranslations('common.errors');
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      // 1. パスワード確認（現在のメールアドレスで再認証）
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: currentEmail,
        password,
      });

      if (signInError) {
        throw new Error(tErrors('auth.wrongPassword'));
      }

      // 2. メールアドレス更新（確認メール送信）
      const { error: updateError } = await supabase.auth.updateUser(
        { email: newEmail },
        {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      );

      if (updateError) {
        throw new Error(`${tErrors('auth.emailUpdateFailed')}: ${updateError.message}`);
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
    setPassword('');
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
                  enterKeyHint="next"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="new@example.com"
                  required
                  autoComplete="email"
                  aria-invalid={!!error}
                  aria-describedby={error ? 'email-change-error' : undefined}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">{t('passwordConfirm')}</Label>
                <Input
                  id="password"
                  type="password"
                  enterKeyHint="go"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('passwordPlaceholder')}
                  required
                  autoComplete="current-password"
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
