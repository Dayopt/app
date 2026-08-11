'use client';

import { useState } from 'react';

import { toast } from '@/lib/toast';
import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { LabeledRow } from '@/components/ui/display/LabeledRow';
import { hasPasswordIdentity, hasVerifiedMfaFactor, useAuthStore } from '@/features/auth';
import { logger } from '@/lib/logger';
import { observeAuthOperation } from '@/lib/sentry';
import { createClient } from '@/lib/supabase/client';
import { api } from '@/lib/trpc';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Input,
} from '@dayopt/components';

/**
 * 🗑️ Account Deletion Dialog Component
 *
 * アカウント即時削除の確認ダイアログ
 * - パスワード確認
 * - 確認テキスト入力（"DELETE"）
 *
 * @see Issue #548 - データ削除リクエスト機能（忘れられる権利）
 */
export function AccountDeletionDialog() {
  const t = useTranslations();
  const [isOpen, setIsOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const user = useAuthStore((state) => state.user);
  // 再認証はユーザーが持っている手段で行う。Google のみのユーザーはパスワードを持たない
  const canUsePassword = hasPasswordIdentity(user);
  const [needsTotp, setNeedsTotp] = useState(false);
  const requiresTotp = hasVerifiedMfaFactor(user) || needsTotp;

  const deleteAccountMutation = api.user.deleteAccount.useMutation({
    onSuccess: async () => {
      toast.success(t('settings.account.deletion.success'));
      setIsOpen(false);

      // ローカルセッションをクリアしてからリダイレクト
      try {
        const supabase = createClient();
        await observeAuthOperation('sign_out_after_account_deletion', () =>
          supabase.auth.signOut(),
        );
      } catch {
        // auth.users 削除済みのため signOut が失敗する可能性がある — 無視して続行
      }
      window.location.href = '/auth/login';
    },
    onError: (error) => {
      logger.error('Account deletion failed', error, {
        component: 'account-deletion-dialog',
      });

      // user.factors がセッションに載っていないと MFA 有無を事前に判定できない。
      // サーバーがコードを要求してきた時点で入力欄を出す
      if (error.message.includes('Verification code is required')) {
        setNeedsTotp(true);
        toast.error(t('settings.account.deletion.totpRequired'));
        return;
      }

      if (error.message.includes('Invalid verification code')) {
        toast.error(t('settings.account.deletion.invalidTotp'));
      } else if (error.message.includes('Invalid password')) {
        toast.error(t('settings.account.deletion.invalidPassword'));
      } else {
        // 生の英語メッセージを画面に出さない（i18n 破れと内部文言の露出を防ぐ）。
        // 原因は上の logger.error に残る。再認証手段が使えない場合（REAUTH_UNAVAILABLE）も
        // ここに落ちるため、文言には問い合わせ先を含めている
        toast.error(t('settings.account.deletion.error'));
      }
    },
  });

  const handleDelete = async () => {
    if (confirmText !== 'DELETE') {
      toast.error(t('settings.account.deletion.confirmTextError'));
      return;
    }

    if (canUsePassword && !password) {
      toast.error(t('settings.account.deletion.passwordRequired'));
      return;
    }

    deleteAccountMutation.mutate({
      confirmText: 'DELETE',
      // 再認証はユーザーが持っている手段で行う。持たない手段は送らない
      ...(canUsePassword ? { password } : {}),
      ...(!canUsePassword && totpCode ? { totpCode } : {}),
    });
  };

  return (
    <>
      <LabeledRow
        label={t('settings.account.deletion.title')}
        description={t('settings.account.deletion.warningMessage')}
      >
        <Button
          type="button"
          onClick={() => setIsOpen(true)}
          variant="outline"
          className="border-destructive text-destructive hover:bg-destructive-state-hover"
          disabled={deleteAccountMutation.isPending}
        >
          {deleteAccountMutation.isPending
            ? t('settings.account.deletion.deleting')
            : t('settings.account.deletion.buttonText')}
        </Button>
      </LabeledRow>

      <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="text-destructive h-5 w-5" />
              {t('settings.account.deletion.dialogTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p>{t('settings.account.deletion.dialogDescription')}</p>

              {canUsePassword ? (
                <div className="space-y-2">
                  <label
                    htmlFor="delete-account-password"
                    className="text-foreground text-base font-normal md:text-sm"
                  >
                    {t('settings.account.deletion.passwordLabel')}
                  </label>
                  <Input
                    id="delete-account-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('settings.account.deletion.passwordPlaceholder')}
                    disabled={deleteAccountMutation.isPending}
                  />
                </div>
              ) : (
                requiresTotp && (
                  <div className="space-y-2">
                    <label
                      htmlFor="delete-account-totp"
                      className="text-foreground text-base font-normal md:text-sm"
                    >
                      {t('settings.account.deletion.totpLabel')}
                    </label>
                    <Input
                      id="delete-account-totp"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value)}
                      placeholder="000000"
                      maxLength={6}
                      disabled={deleteAccountMutation.isPending}
                    />
                  </div>
                )
              )}

              <div className="space-y-2">
                <label
                  htmlFor="delete-account-confirm"
                  className="text-foreground text-base font-normal md:text-sm"
                >
                  {t('settings.account.deletion.confirmTextLabel')}
                </label>
                <Input
                  id="delete-account-confirm"
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="DELETE"
                  disabled={deleteAccountMutation.isPending}
                />
                <p className="text-muted-foreground text-xs">
                  {t('settings.account.deletion.confirmTextHint')}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteAccountMutation.isPending}>
              {t('settings.account.deletion.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={
                deleteAccountMutation.isPending ||
                confirmText !== 'DELETE' ||
                (canUsePassword && !password)
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive-hover"
            >
              {deleteAccountMutation.isPending
                ? t('settings.account.deletion.deleting')
                : t('settings.account.deletion.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
