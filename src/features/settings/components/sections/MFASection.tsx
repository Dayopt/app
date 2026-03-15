'use client';

import { Button } from '@/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { useTranslations } from 'next-intl';

import { SectionCard } from '@/components/common/SectionCard';
import { useMFA } from '../../hooks/useMFA';

/**
 * MFA（二段階認証）セクション
 *
 * TOTP認証の登録・管理UIを提供
 */
export function MFASection() {
  const t = useTranslations();
  const {
    hasMFA,
    showMFASetup,
    qrCode,
    secret,
    verificationCode,
    error,
    success,
    isLoading,
    recoveryCodes,
    recoveryCodeCount,
    setVerificationCode,
    enrollMFA,
    verifyMFA,
    disableMFA,
    cancelSetup,
    regenerateRecoveryCodes,
    dismissRecoveryCodes,
  } = useMFA();

  return (
    <SectionCard title={t('settings.account.twoFactor')}>
      <div className="space-y-4">
        {/* エラー・成功メッセージ */}
        {error && (
          <div className="border-destructive text-destructive rounded-2xl border p-4 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="border-success text-success rounded-2xl border p-4 text-sm">
            {success}
          </div>
        )}

        {/* リカバリーコード表示 */}
        {recoveryCodes && (
          <div className="border-warning space-y-4 rounded-2xl border p-4">
            <div>
              <h3 className="text-warning mb-2 text-lg font-bold">
                ⚠️ {t('settings.account.mfa.recoveryCodes.title')}
              </h3>
              <p className="text-muted-foreground text-sm">
                {t('settings.account.mfa.recoveryCodes.description')}
                <strong className="text-foreground">
                  {' '}
                  {t('settings.account.mfa.recoveryCodes.oneTimeUse')}
                </strong>
              </p>
            </div>

            <div className="bg-surface-inset grid grid-cols-2 gap-2 rounded-2xl p-4 font-mono text-sm">
              {recoveryCodes.map((code, index) => (
                <div key={index} className="text-foreground">
                  {code}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-xs">
                {t('settings.account.mfa.recoveryCodes.saveWarning')}
              </p>
              <Button variant="outline" onClick={dismissRecoveryCodes}>
                {t('settings.account.mfa.recoveryCodes.saved')}
              </Button>
            </div>
          </div>
        )}

        {/* MFA未設定時の表示 */}
        {!hasMFA && !showMFASetup && (
          <div className="flex items-center justify-between">
            <div>
              <div className="text-base font-normal">{t('settings.account.mfa.title')}</div>
              <p className="text-muted-foreground mt-1 text-sm">
                {t('settings.account.mfa.description')}
              </p>
            </div>
            <Button type="button" onClick={enrollMFA} disabled={isLoading}>
              {isLoading ? t('settings.account.mfa.loading') : t('settings.account.mfa.enableMFA')}
            </Button>
          </div>
        )}

        {/* MFA設定中の表示 */}
        {!hasMFA && showMFASetup && qrCode && (
          <div className="bg-muted space-y-4 rounded-2xl p-6">
            <div>
              <h3 className="mb-2 text-lg font-bold">{t('settings.account.mfa.setup.title')}</h3>
              <p className="text-muted-foreground text-sm">
                {t('settings.account.mfa.setup.description')}
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <p className="mb-2 text-sm font-normal">{t('settings.account.mfa.setup.step1')}</p>
                {/* QRコードは白背景必須（読み取り精度のため） */}
                <div className="flex justify-center rounded-2xl bg-white p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrCode} alt="QR Code" className="h-48 w-48" />
                </div>
                <p className="text-muted-foreground mt-2 text-xs">
                  {t('settings.account.mfa.setup.step1Desc')}
                </p>
              </div>

              {secret && (
                <div>
                  <p className="mb-2 text-sm font-normal">
                    {t('settings.account.mfa.setup.manualEntry')}
                  </p>
                  <code className="bg-surface-inset block rounded p-2 text-xs">{secret}</code>
                </div>
              )}

              <div>
                <p className="mb-2 text-sm font-normal">{t('settings.account.mfa.setup.step2')}</p>
                <div className="flex items-center gap-4">
                  <InputOTP maxLength={6} value={verificationCode} onChange={setVerificationCode}>
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                  <Button onClick={verifyMFA} disabled={isLoading || verificationCode.length !== 6}>
                    {isLoading
                      ? t('settings.account.mfa.verifying')
                      : t('settings.account.mfa.verify')}
                  </Button>
                  <Button variant="ghost" onClick={cancelSetup}>
                    {t('settings.account.mfa.cancel')}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MFA有効時の表示 */}
        {hasMFA && !recoveryCodes && (
          <div className="space-y-4">
            <div className="border-success rounded-2xl border p-4">
              <div className="mb-2 flex items-center gap-2">
                <div className="bg-success h-2 w-2 rounded-full"></div>
                <span className="text-success text-sm font-normal">
                  {t('settings.account.mfa.enabled.title')}
                </span>
              </div>
              <p className="text-muted-foreground text-xs">
                {t('settings.account.mfa.enabled.description')}
              </p>
            </div>

            {/* リカバリーコード枯渇警告 */}
            {recoveryCodeCount === 0 && (
              <div className="border-destructive bg-destructive/10 rounded-2xl border p-4">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-destructive text-sm font-bold">
                    {t('settings.account.mfa.recoveryCodes.noCodesLeft')}
                  </span>
                </div>
                <p className="text-destructive text-xs">
                  {t('settings.account.mfa.recoveryCodes.exhaustedWarning')}
                </p>
                <div className="mt-3">
                  <Button
                    variant="destructive"
                    onClick={regenerateRecoveryCodes}
                    disabled={isLoading}
                  >
                    {isLoading
                      ? t('settings.account.mfa.generating')
                      : t('settings.account.mfa.regenerate')}
                  </Button>
                </div>
              </div>
            )}

            {/* リカバリーコード状態（残りがある場合） */}
            {recoveryCodeCount > 0 && (
              <div className="bg-muted rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-normal">
                      {t('settings.account.mfa.recoveryCodes.sectionTitle')}
                    </div>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {t('settings.account.mfa.recoveryCodes.remaining', {
                        count: recoveryCodeCount,
                      })}
                    </p>
                  </div>
                  <Button onClick={regenerateRecoveryCodes} disabled={isLoading}>
                    {isLoading
                      ? t('settings.account.mfa.generating')
                      : t('settings.account.mfa.regenerate')}
                  </Button>
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button variant="destructive" onClick={disableMFA} disabled={isLoading}>
                {isLoading
                  ? t('settings.account.mfa.processing')
                  : t('settings.account.mfa.disableMFA')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
