import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';

import { MFAVerifyForm } from './MFAVerifyForm';

/** MFAVerifyForm - 2段階認証フォーム（TOTP / リカバリーコード） */
const meta = {
  title: 'Product/Features/Auth/MFAVerifyForm',
  component: MFAVerifyForm,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  args: {
    mode: 'totp',
    verificationCode: '',
    recoveryCode: '',
    isVerifying: false,
    error: null,
    loginHref: '/ja/auth/login',
    onVerificationCodeChange: () => undefined,
    onRecoveryCodeChange: () => undefined,
    onVerifyTotp: () => undefined,
    onVerifyRecovery: () => undefined,
    onSwitchMode: () => undefined,
  },
} satisfies Meta<typeof MFAVerifyForm>;

export default meta;
type Story = StoryObj<typeof meta>;

// ── Interactive Wrapper（状態を内包）──

interface MFAVerifyFormStoryProps {
  initialMode?: 'totp' | 'recovery';
  initialError?: string | null;
  isVerifying?: boolean;
}

function MFAVerifyFormStory({
  initialMode = 'totp',
  initialError = null,
  isVerifying = false,
}: MFAVerifyFormStoryProps) {
  const [mode, setMode] = useState<'totp' | 'recovery'>(initialMode);
  const [verificationCode, setVerificationCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [error, setError] = useState<string | null>(initialError);

  return (
    <MFAVerifyForm
      mode={mode}
      verificationCode={verificationCode}
      onVerificationCodeChange={setVerificationCode}
      recoveryCode={recoveryCode}
      onRecoveryCodeChange={setRecoveryCode}
      isVerifying={isVerifying}
      error={error}
      onVerifyTotp={() => setError(null)}
      onVerifyRecovery={() => setError(null)}
      onSwitchMode={(newMode) => {
        setMode(newMode);
        setError(null);
        setVerificationCode('');
        setRecoveryCode('');
      }}
      loginHref="/ja/auth/login"
    />
  );
}

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** デフォルト表示（TOTPモード） */
export const Default: Story = {
  render: () => <MFAVerifyFormStory />,
};

/** リカバリーコードモード */
export const RecoveryMode: Story = {
  render: () => <MFAVerifyFormStory initialMode="recovery" />,
};

/** エラー表示（無効なコード） */
export const WithError: Story = {
  render: () => <MFAVerifyFormStory initialError="無効なコードです。もう一度お試しください" />,
};

/** 認証中（ローディング）状態 */
export const Verifying: Story = {
  args: {
    mode: 'totp',
    verificationCode: '123456',
    isVerifying: true,
    error: null,
  },
};

/** リカバリーコード認証中 */
export const RecoveryVerifying: Story = {
  args: {
    mode: 'recovery',
    recoveryCode: 'ABCD-EFGH',
    isVerifying: true,
    error: null,
  },
};

/** リカバリーコード使い切りエラー */
export const RecoveryExhausted: Story = {
  render: () => (
    <MFAVerifyFormStory
      initialMode="recovery"
      initialError="すべてのリカバリーコードが使用済みです"
    />
  ),
};

/** OTPコード入力のインタラクションテスト */
export const OTPInput: Story = {
  render: () => <MFAVerifyFormStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // OTP入力スロットが6つ存在することを確認
    const slots = canvasElement.querySelectorAll('[data-input-otp-slot]');
    await expect(slots.length).toBe(6);

    // 認証ボタンが無効化されていることを確認（コード未入力）
    const verifyButton = canvas.getByRole('button', { name: /認証/ });
    await expect(verifyButton).toBeDisabled();
  },
};

/** モード切替のインタラクションテスト */
export const ModeSwitching: Story = {
  render: () => <MFAVerifyFormStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // リカバリーコードモードに切替
    const recoveryLink = canvas.getByRole('button', { name: /リカバリーコードを使用/ });
    await userEvent.click(recoveryLink);

    // リカバリーコード入力が表示されることを確認
    const recoveryInput = canvas.getByPlaceholderText('XXXX-XXXX');
    await expect(recoveryInput).toBeInTheDocument();

    // TOTPモードに戻す
    const totpLink = canvas.getByRole('button', { name: /認証コードを使う/ });
    await userEvent.click(totpLink);

    // OTP入力スロットが再表示されることを確認
    const slots = canvasElement.querySelectorAll('[data-input-otp-slot]');
    await expect(slots.length).toBe(6);
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <p className="text-muted-foreground mb-2 text-xs">TOTP（デフォルト）</p>
      <MFAVerifyFormStory />
      <p className="text-muted-foreground mb-2 text-xs">リカバリーコード</p>
      <MFAVerifyFormStory initialMode="recovery" />
      <p className="text-muted-foreground mb-2 text-xs">エラー表示</p>
      <MFAVerifyFormStory initialError="無効なコードです。もう一度お試しください" />
      <p className="text-muted-foreground mb-2 text-xs">リカバリーコード使い切り</p>
      <MFAVerifyFormStory
        initialMode="recovery"
        initialError="すべてのリカバリーコードが使用済みです"
      />
    </div>
  ),
};
