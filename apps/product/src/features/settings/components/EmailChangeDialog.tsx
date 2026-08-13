'use client';

import { useState } from 'react';

import { Eye, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { api } from '@/lib/trpc';
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
 * サービスエラーコードを取り出す。`formatTrpcError`（`lib/trpc/router.ts`）が付与する
 * `error.data.serviceCode` は tRPC の標準型に含まれないため、runtime で型ガードする
 * （`useTimeblockWriteMutations.ts` の `getTimeblockServiceCode` と同型）。
 */
function getEmailChangeServiceCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('data' in error)) return undefined;
  const data = error.data;
  if (!data || typeof data !== 'object' || !('serviceCode' in data)) return undefined;
  return typeof data.serviceCode === 'string' ? data.serviceCode : undefined;
}

/**
 * メールアドレス変更ダイアログ。
 *
 * 本人確認は Secure Email Change（旧・新アドレス双方への確認メール）に**加えて**、
 * 変更前パスワード再認証を要求する（#2024 の中間案。双方確認は手放さない）。
 *
 * パスワード検証と `updateUser` 実行は `user.requestEmailChange` procedure が
 * server 側で一体的に行う（`features/auth/server/router.ts`。service-role 経由の
 * captcha 免除で、client 側 `signInWithPassword` は使わない — #1917 の captcha_failed
 * 回帰を避けるため）。この dialog は結果を受け取るだけで、GoTrue の `updateUser` を
 * 直接呼ぶ経路は持たない。
 */
export function EmailChangeDialog({ open, onOpenChange, currentEmail }: EmailChangeDialogProps) {
  const t = useTranslations('settings.account.emailChange');
  const tRoot = useTranslations();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const requestEmailChangeMutation = api.user.requestEmailChange.useMutation({
    // 不可逆操作ではないが、自動リトライすると reauth の専用 rate limit（5回/10分）を
    // パスワード誤り 1 回で 2 消費し、GoTrue の共有 IP バケットも二重に叩く
    // （AccountDeletionDialog.tsx の retry: false と同じ理由。#1925 / #2024）
    retry: false,
    onSuccess: () => {
      setError(null);
      setSuccess(true);
    },
    onError: (mutationError) => {
      if (mutationError.data?.code === 'TOO_MANY_REQUESTS') {
        setError(tRoot('settings.account.emailChange.rateLimited'));
        return;
      }

      const serviceCode = getEmailChangeServiceCode(mutationError);
      if (serviceCode === 'INVALID_PASSWORD') {
        setError(tRoot('settings.account.emailChange.invalidPassword'));
        return;
      }

      // REAUTH_UNAVAILABLE（パスワード identity が無い。本来 UI で弾いている）/
      // EMAIL_UPDATE_FAILED はすべて汎用文言に畳む。
      // 生の GoTrue エラー文言はここに出さない（OWASP サニタイズ）
      setError(tRoot('common.errors.generic'));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    requestEmailChangeMutation.mutate({ password, newEmail });
  };

  const handleClose = () => {
    setPassword('');
    setShowPassword(false);
    setNewEmail('');
    setError(null);
    setSuccess(false);
    onOpenChange(false);
  };

  const isLoading = requestEmailChangeMutation.isPending;

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
                <Label htmlFor="email-change-password">
                  {tRoot('settings.account.currentPassword')}
                </Label>
                <div className="relative">
                  <Input
                    id="email-change-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="pr-8"
                    aria-invalid={!!error}
                    aria-describedby={error ? 'email-change-error' : undefined}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    icon
                    className="absolute top-1/2 right-1 -translate-y-1/2"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={
                      showPassword
                        ? tRoot('settings.account.hidePassword')
                        : tRoot('settings.account.showPassword')
                    }
                  >
                    {showPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </Button>
                </div>
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
