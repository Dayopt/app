import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';

import { SectionCard } from '@/components/common/SectionCard';

// ─────────────────────────────────────────────────────────
// Demo Components（MFASection の各状態を props 駆動で再現）
// ─────────────────────────────────────────────────────────

/** MFA未設定状態 */
function MFADisabledDemo() {
  const [isLoading, setIsLoading] = useState(false);

  return (
    <SectionCard title="2段階認証">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-base font-normal">認証アプリによる2段階認証</div>
            <p className="text-muted-foreground mt-1 text-sm">
              認証アプリを使用してアカウントのセキュリティを強化します
            </p>
          </div>
          <Button
            type="button"
            onClick={() => {
              setIsLoading(true);
              setTimeout(() => setIsLoading(false), 1500);
            }}
            disabled={isLoading}
          >
            {isLoading ? '読み込み中...' : '有効にする'}
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}

/** MFA設定中（QRコード表示）状態 */
function MFASetupDemo() {
  const [verificationCode, setVerificationCode] = useState('');

  return (
    <SectionCard title="2段階認証">
      <div className="space-y-4">
        <div className="bg-muted space-y-4 rounded-2xl p-6">
          <div>
            <h3 className="mb-2 text-lg font-bold">認証アプリの設定</h3>
            <p className="text-muted-foreground text-sm">
              以下の手順に従って認証アプリを設定してください
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <p className="mb-2 text-sm font-normal">1. QRコードをスキャン</p>
              <div className="flex justify-center rounded-2xl bg-white p-4">
                <div className="bg-muted flex h-48 w-48 items-center justify-center rounded text-sm">
                  QR Code
                </div>
              </div>
              <p className="text-muted-foreground mt-2 text-xs">
                Google Authenticator、Authy、1Password 等の認証アプリでスキャンしてください
              </p>
            </div>

            <div>
              <p className="mb-2 text-sm font-normal">手動入力用シークレットキー</p>
              <code className="bg-surface-inset block rounded p-2 text-xs">JBSWY3DPEHPK3PXP</code>
            </div>

            <div>
              <p className="mb-2 text-sm font-normal">2. 認証コードを入力</p>
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
                <Button disabled={verificationCode.length !== 6}>認証</Button>
                <Button variant="ghost">キャンセル</Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

/** MFA有効（リカバリーコード残あり）状態 */
function MFAEnabledDemo({ recoveryCodeCount }: { recoveryCodeCount: number }) {
  return (
    <SectionCard title="2段階認証">
      <div className="space-y-4">
        <div className="border-success rounded-2xl border p-4">
          <div className="mb-2 flex items-center gap-2">
            <div className="bg-success h-2 w-2 rounded-full"></div>
            <span className="text-success text-sm font-normal">2段階認証が有効です</span>
          </div>
          <p className="text-muted-foreground text-xs">
            認証アプリによる2段階認証が設定されています
          </p>
        </div>

        {recoveryCodeCount === 0 ? (
          <div className="border-destructive bg-destructive/10 rounded-2xl border p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-destructive text-sm font-bold">
                リカバリーコードがありません
              </span>
            </div>
            <p className="text-destructive text-xs">
              リカバリーコードがすべて使用済みです。デバイスを紛失するとアカウントにアクセスできなくなります。今すぐ再生成してください。
            </p>
            <div className="mt-3">
              <Button variant="destructive">再生成</Button>
            </div>
          </div>
        ) : (
          <div className="bg-muted rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-normal">リカバリーコード</div>
                <p className="text-muted-foreground mt-1 text-xs">
                  残り {recoveryCodeCount} 個のコードが利用可能です
                </p>
              </div>
              <Button>再生成</Button>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="destructive">2段階認証を無効にする</Button>
        </div>
      </div>
    </SectionCard>
  );
}

/** リカバリーコード表示状態 */
function RecoveryCodesDisplayDemo() {
  const mockCodes = [
    'ABCD-EF23',
    'GHJK-LM45',
    'NPQR-ST67',
    'UVWX-YZ89',
    'AB23-CD45',
    'EF67-GH89',
    'JK23-LM45',
    'NP67-QR89',
    'ST23-UV45',
    'WX67-YZ89',
  ];

  return (
    <SectionCard title="2段階認証">
      <div className="space-y-4">
        <div className="border-success rounded-2xl border p-4 text-sm">
          2段階認証が有効になりました
        </div>

        <div className="border-warning space-y-4 rounded-2xl border p-4">
          <div>
            <h3 className="text-warning mb-2 text-lg font-bold">リカバリーコード</h3>
            <p className="text-muted-foreground text-sm">
              認証アプリにアクセスできなくなった場合、これらのコードでログインできます。
              <strong className="text-foreground"> 各コードは1回のみ使用可能です。</strong>
            </p>
          </div>

          <div className="bg-surface-inset grid grid-cols-2 gap-2 rounded-2xl p-4 font-mono text-sm">
            {mockCodes.map((code, index) => (
              <div key={index} className="text-foreground">
                {code}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-xs">
              これらのコードを安全な場所に保存してください。この画面を閉じると再表示できません。
            </p>
            <Button variant="outline">保存しました</Button>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

/** MFA無効化確認ダイアログ */
function DisableDialogDemo() {
  const [open, setOpen] = useState(true);
  const [code, setCode] = useState('');

  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        ダイアログを開く
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>2段階認証を無効にする</AlertDialogTitle>
            <AlertDialogDescription>
              2段階認証を無効にするには、認証アプリの6桁のコードを入力してください。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex justify-center py-4">
            <InputOTP maxLength={6} value={code} onChange={setCode}>
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              disabled={code.length !== 6}
              className="bg-destructive text-destructive-foreground hover:bg-destructive-hover"
            >
              MFAを無効にする
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** リカバリーコード再生成確認ダイアログ */
function RegenerateDialogDemo() {
  const [open, setOpen] = useState(true);

  return (
    <>
      <Button onClick={() => setOpen(true)}>ダイアログを開く</Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>リカバリーコードを再生成</AlertDialogTitle>
            <AlertDialogDescription>
              新しいコードを生成すると、既存のリカバリーコードはすべて無効になります。この操作は元に戻せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction>再生成</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─────────────────────────────────────────────────────────
// Meta & Stories
// ─────────────────────────────────────────────────────────

const meta = {
  title: 'Features/Settings/MFASection',
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** MFA未設定状態。有効化ボタンを表示。 */
export const Disabled: Story = {
  render: () => (
    <div className="max-w-2xl">
      <MFADisabledDemo />
    </div>
  ),
};

/** QRコード表示中のMFA設定フロー。 */
export const Setup: Story = {
  render: () => (
    <div className="max-w-2xl">
      <MFASetupDemo />
    </div>
  ),
};

/** MFA有効、リカバリーコード残り8個。 */
export const EnabledWithCodes: Story = {
  render: () => (
    <div className="max-w-2xl">
      <MFAEnabledDemo recoveryCodeCount={8} />
    </div>
  ),
};

/** MFA有効、リカバリーコード残り2個（少数警戒）。 */
export const EnabledFewCodes: Story = {
  render: () => (
    <div className="max-w-2xl">
      <MFAEnabledDemo recoveryCodeCount={2} />
    </div>
  ),
};

/** MFA有効、リカバリーコード枯渇（0個）。destructive警告を表示。 */
export const EnabledExhausted: Story = {
  render: () => (
    <div className="max-w-2xl">
      <MFAEnabledDemo recoveryCodeCount={0} />
    </div>
  ),
};

/** MFA有効化直後のリカバリーコード表示。 */
export const RecoveryCodesDisplay: Story = {
  render: () => (
    <div className="max-w-2xl">
      <RecoveryCodesDisplayDemo />
    </div>
  ),
};

/** MFA無効化確認ダイアログ。OTP入力付き。 */
export const DisableDialog: Story = {
  render: () => <DisableDialogDemo />,
};

/** リカバリーコード再生成確認ダイアログ。 */
export const RegenerateDialog: Story = {
  render: () => <RegenerateDialogDemo />,
};

/** 全パターン一覧（ダイアログ除く）。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex max-w-2xl flex-col items-start gap-6">
      <MFADisabledDemo />
      <MFASetupDemo />
      <MFAEnabledDemo recoveryCodeCount={8} />
      <MFAEnabledDemo recoveryCodeCount={2} />
      <MFAEnabledDemo recoveryCodeCount={0} />
      <RecoveryCodesDisplayDemo />
    </div>
  ),
};
