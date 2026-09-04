'use client';

import { useCallback, useState } from 'react';

import { toast } from '@/lib/toast';
import { Camera, LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { hasPasswordIdentity, useAuthStore } from '@/features/auth';
import { logger } from '@/lib/logger';
import { observeAuthOperation } from '@/lib/sentry';
import { createClient } from '@/lib/supabase/client';
import { getAvatarUrl, getDisplayName, getInitials } from '@/lib/user';
import { Avatar, AvatarFallback, AvatarImage, Button } from '@dayopt/components';
import { useRouter } from '@dayopt/i18n/navigation';

import { LabeledRow } from '@/components/ui/display/LabeledRow';
import { SectionCard } from '@/components/ui/display/SectionCard';
import { AccountDeletionDialog } from './AccountDeletionDialog';
import { AvatarChangeDialog } from './AvatarChangeDialog';
import { DisplayNameDialog } from './DisplayNameDialog';
import { EmailChangeDialog } from './EmailChangeDialog';
import { PasswordChangeDialog } from './PasswordChangeDialog';
import { type MFASectionProps, MFASection } from './sections/MFASection';

/** AccountSettings のプロップス定義 */
interface AccountSettingsProps {
  /**
   * テスト・Storybook用 MFASection 差し替え。
   * 省略時は本物の MFASection を使用。
   * 本番コードでは渡さない。
   */
  _MFASectionProps?: MFASectionProps;
}

/**
 * アカウント設定コンポーネント
 *
 * プロフィール（アバター・表示名）、メール、パスワード、2段階認証、ログアウト、アカウント削除
 */
export function AccountSettings({ _MFASectionProps }: AccountSettingsProps = {}) {
  const t = useTranslations();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [showAvatarDialog, setShowAvatarDialog] = useState(false);
  const [showDisplayNameDialog, setShowDisplayNameDialog] = useState(false);

  const email = user?.email || '';
  // Google のみのユーザーはパスワードを持たない。パスワード前提の UI を出さない
  const canUsePassword = hasPasswordIdentity(user);
  const avatarUrl = getAvatarUrl(user);
  const displayName = getDisplayName(user);

  const handleLogout = useCallback(async () => {
    setIsLoggingOut(true);
    try {
      const supabase = createClient();
      await observeAuthOperation('sign_out', () => supabase.auth.signOut());
      toast.success(t('navigation.navUser.logoutSuccess'));
      router.push('/auth/login');
      router.refresh();
    } catch (error) {
      logger.error('Logout error:', error);
      toast.error(t('navigation.navUser.logoutFailed'));
    } finally {
      setIsLoggingOut(false);
    }
  }, [t, router]);

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* アバター・表示名 */}
      <SectionCard title={t('settings.account.profile')}>
        <LabeledRow
          label={t('settings.account.avatar')}
          variant="navigate"
          onClick={() => setShowAvatarDialog(true)}
        >
          <div className="group relative">
            <Avatar size="sm">
              <AvatarImage src={avatarUrl || undefined} alt={displayName} />
              <AvatarFallback className="bg-foreground text-background text-xs">
                {getInitials(displayName)}
              </AvatarFallback>
            </Avatar>
            <div className="group-hover:bg-foreground absolute inset-0 flex items-center justify-center rounded-full transition-colors group-hover:opacity-40">
              <Camera className="h-4 w-4 text-white opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
          </div>
        </LabeledRow>
        <LabeledRow
          label={t('settings.account.displayName')}
          variant="navigate"
          onClick={() => setShowDisplayNameDialog(true)}
        >
          <span className="text-muted-foreground">{displayName}</span>
        </LabeledRow>
      </SectionCard>

      {/* ログイン方法（Google のみのユーザーにだけ出す。パスワード派は自明なので出さない） */}
      {!canUsePassword && (
        <SectionCard title={t('settings.account.loginMethod.title')}>
          <LabeledRow
            label={
              <span className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="size-4">
                  <path
                    d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
                    fill="currentColor"
                  />
                </svg>
                {t('settings.account.loginMethod.google')}
              </span>
            }
            variant="display"
          />
        </SectionCard>
      )}

      {/* メールアドレス。Google ユーザーは Google 側が正本なので変更させない */}
      <SectionCard title={t('settings.account.email')}>
        {canUsePassword ? (
          <LabeledRow
            label={email || t('settings.account.noEmail')}
            variant="navigate"
            onClick={() => setShowEmailDialog(true)}
          />
        ) : (
          <LabeledRow
            label={email || t('settings.account.noEmail')}
            description={t('settings.account.emailManagedByProvider')}
            variant="display"
          />
        )}
      </SectionCard>

      {/* パスワード。持っていないユーザーには行ごと出さない */}
      {canUsePassword && (
        <SectionCard title={t('settings.account.password')}>
          <LabeledRow
            label="••••••••"
            variant="navigate"
            onClick={() => setShowPasswordDialog(true)}
          />
        </SectionCard>
      )}

      {/* 2段階認証 */}
      <MFASection {..._MFASectionProps} />

      {/* セッション */}
      <SectionCard title={t('settings.account.session')}>
        <LabeledRow label={t('navigation.navUser.logout')}>
          <Button variant="outline" onClick={handleLogout} disabled={isLoggingOut}>
            <LogOut className="mr-2 h-4 w-4" />
            {isLoggingOut ? t('navigation.navUser.loggingOut') : t('navigation.navUser.logout')}
          </Button>
        </LabeledRow>
      </SectionCard>

      {/* 危険な操作 */}
      <SectionCard title={t('settings.account.dangerZone')}>
        <AccountDeletionDialog />
      </SectionCard>

      {/* Dialogs */}
      <AvatarChangeDialog open={showAvatarDialog} onOpenChange={setShowAvatarDialog} />
      <DisplayNameDialog
        open={showDisplayNameDialog}
        onOpenChange={setShowDisplayNameDialog}
        currentName={displayName}
      />
      <EmailChangeDialog
        open={showEmailDialog}
        onOpenChange={setShowEmailDialog}
        currentEmail={email}
      />
      <PasswordChangeDialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog} />
    </div>
  );
}
