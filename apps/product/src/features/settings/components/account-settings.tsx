'use client';

import { useCallback, useState } from 'react';

import { toast } from '@/lib/toast';
import { Badge, Button as SharedButton } from '@dayopt/components';
import { LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useAuthStore } from '@/features/auth';
import { useRouter } from '@/lib/i18n/navigation';
import { logger } from '@/lib/logger';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@dayopt/components';

import { LabeledRow } from '@/lib/components/common/LabeledRow';
import { SectionCard } from '@/lib/components/common/SectionCard';
import { AccountDeletionDialog } from './account-deletion-dialog';
import { EmailChangeDialog } from './email-change-dialog';
import { PasswordChangeDialog } from './password-change-dialog';
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
 * メール、パスワード、ソーシャルログイン、ログアウト、アカウント削除
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
      await supabase.auth.signOut();
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

      {/* ソーシャルログイン連携 */}
      <SectionCard title={t('settings.account.socialLogin')}>
        <LabeledRow
          label={
            <span className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4">
                <path
                  d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
                  fill="currentColor"
                />
              </svg>
              Google
            </span>
          }
          description={t('settings.account.notConnected')}
        >
          <SharedButton variant="outline" disabled>
            {t('settings.account.connect')}
          </SharedButton>
        </LabeledRow>
        <LabeledRow
          label={
            <span className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4">
                <path
                  d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"
                  fill="currentColor"
                />
              </svg>
              Apple
            </span>
          }
          description={t('settings.account.notConnected')}
        >
          <SharedButton variant="outline" disabled>
            {t('settings.account.connect')}
          </SharedButton>
        </LabeledRow>
        <LabeledRow
          label={
            <span className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4">
                <path
                  d="M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973a6.624 6.624 0 0 0 .265.86 5.297 5.297 0 0 0 .371.761c.696 1.159 1.818 1.927 3.593 1.927 1.497 0 2.633-.671 3.965-2.444.76-1.012 1.144-1.626 2.663-4.32l.756-1.339.186-.325c.061.1.121.196.183.3l2.152 3.595c.724 1.21 1.665 2.556 2.47 3.314 1.046.987 1.992 1.22 3.06 1.22 1.075 0 1.876-.355 2.455-.843a3.743 3.743 0 0 0 .81-.973c.542-.939.861-2.127.861-3.745 0-2.72-.681-5.357-2.084-7.45-1.282-1.912-2.957-2.93-4.716-2.93-1.047 0-2.088.467-3.053 1.308-.652.57-1.257 1.29-1.82 2.05-.69-.875-1.335-1.547-1.958-2.056-1.182-.966-2.315-1.303-3.454-1.303zm10.16 2.053c1.147 0 2.188.758 2.992 1.999 1.132 1.748 1.647 4.195 1.647 6.4 0 1.548-.368 2.9-1.839 2.9-.58 0-1.027-.23-1.664-1.004-.496-.601-1.343-1.878-2.832-4.358l-.617-1.028a44.908 44.908 0 0 0-1.255-1.98c.07-.109.141-.224.211-.327 1.12-1.667 2.118-2.602 3.358-2.602zm-8.201.553c1.265 0 2.058.791 2.675 1.446.307.327.737.871 1.234 1.579l-1.02 1.566c-.757 1.163-1.882 3.017-2.837 4.338-1.191 1.649-1.81 1.817-2.486 1.817-.524 0-1.038-.237-1.383-.794-.263-.426-.464-1.13-.464-2.046 0-2.221.63-4.535 1.66-6.088.454-.687.964-1.226 1.533-1.533a2.264 2.264 0 0 1 1.088-.285z"
                  fill="currentColor"
                />
              </svg>
              Meta
            </span>
          }
          description={t('settings.account.notConnected')}
        >
          <SharedButton variant="outline" disabled>
            {t('settings.account.connect')}
          </SharedButton>
        </LabeledRow>
        <p className="text-muted-foreground text-xs">
          <Badge variant="secondary" className="mr-1">
            {t('settings.account.comingSoon')}
          </Badge>
          {t('settings.account.socialLoginDesc')}
        </p>
      </SectionCard>

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
