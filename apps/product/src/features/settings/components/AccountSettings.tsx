'use client';

import { useCallback, useState } from 'react';

import { toast } from '@/lib/toast';
import { LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useAuthStore } from '@/features/auth';
import { logger } from '@/lib/logger';
import { observeAuthOperation } from '@/lib/sentry';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@dayopt/components';
import { useRouter } from '@dayopt/i18n/navigation';

import { LabeledRow } from '@/components/ui/display/LabeledRow';
import { SectionCard } from '@/components/ui/display/SectionCard';
import { AccountDeletionDialog } from './AccountDeletionDialog';
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
 * メール、パスワード、2段階認証、ログアウト、アカウント削除
 */
export function AccountSettings({ _MFASectionProps }: AccountSettingsProps = {}) {
  const t = useTranslations();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);

  const email = user?.email || '';

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
      {/* メールアドレス */}
      <SectionCard title={t('settings.account.email')}>
        <LabeledRow
          label={email || t('settings.account.noEmail')}
          variant="navigate"
          onClick={() => setShowEmailDialog(true)}
        />
      </SectionCard>

      {/* パスワード */}
      <SectionCard title={t('settings.account.password')}>
        <LabeledRow
          label="••••••••"
          variant="navigate"
          onClick={() => setShowPasswordDialog(true)}
        />
      </SectionCard>

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
      <EmailChangeDialog
        open={showEmailDialog}
        onOpenChange={setShowEmailDialog}
        currentEmail={email}
      />
      <PasswordChangeDialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog} />
    </div>
  );
}
