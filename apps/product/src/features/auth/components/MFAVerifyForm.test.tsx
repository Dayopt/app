import { useState } from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { MFAVerifyForm } from './MFAVerifyForm';

// next-intl はグローバル setup（src/lib/test/setup-node.ts）で key passthrough 済み。

type VerifyMode = 'totp' | 'recovery';
type VerifyFlow = 'login' | 'passwordReset';

const noop = () => {};

interface RenderOverrides {
  mode?: VerifyMode;
  flow?: VerifyFlow;
  verificationCode?: string;
  recoveryCode?: string;
  isVerifying?: boolean;
  error?: string | null;
  onVerifyTotp?: () => void;
  onVerifyRecovery?: () => void;
  onSwitchMode?: (mode: VerifyMode) => void;
  onVerificationCodeChange?: (value: string) => void;
  onRecoveryCodeChange?: (value: string) => void;
}

/** 固定 props でのレンダリング（disabled 判定・表示内容の検証用） */
function renderForm(overrides: RenderOverrides = {}) {
  return render(
    <MFAVerifyForm
      mode={overrides.mode ?? 'totp'}
      flow={overrides.flow ?? 'login'}
      verificationCode={overrides.verificationCode ?? ''}
      onVerificationCodeChange={overrides.onVerificationCodeChange ?? noop}
      recoveryCode={overrides.recoveryCode ?? ''}
      onRecoveryCodeChange={overrides.onRecoveryCodeChange ?? noop}
      isVerifying={overrides.isVerifying ?? false}
      error={overrides.error ?? null}
      onVerifyTotp={overrides.onVerifyTotp ?? noop}
      onVerifyRecovery={overrides.onVerifyRecovery ?? noop}
      onSwitchMode={overrides.onSwitchMode ?? noop}
      backHref="/ja/auth/login"
    />,
  );
}

/**
 * verificationCode を実 state で保持するラッパー。
 * InputOTP の onComplete は「前回レンダーの値 < maxLength → 今回 === maxLength」の
 * 遷移を検出して発火するため、実際に React の再レンダーを起こす必要がある。
 */
function ControlledTotpForm({ onVerifyTotp }: { onVerifyTotp: () => void }) {
  const [verificationCode, setVerificationCode] = useState('');
  return (
    <MFAVerifyForm
      mode="totp"
      flow="login"
      verificationCode={verificationCode}
      onVerificationCodeChange={setVerificationCode}
      recoveryCode=""
      onRecoveryCodeChange={noop}
      isVerifying={false}
      error={null}
      onVerifyTotp={onVerifyTotp}
      onVerifyRecovery={noop}
      onSwitchMode={noop}
      backHref="/ja/auth/login"
    />
  );
}

// input-otp v1.4.2 は mount 時の setTimeout(0/10/50ms) を unmount で clear しない。
// 環境 teardown 後に発火すると React が window を参照して unhandled error になる
// （CI でのみ顕在化）ため、teardown 前に leak した timer を発火させ切る。
afterAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, 60));
});

describe('MFAVerifyForm', () => {
  describe('TOTPモード', () => {
    it('verificationCodeが6桁未満の場合、送信ボタンがdisabledになる', () => {
      renderForm({ verificationCode: '12345' });

      expect(screen.getByRole('button', { name: 'auth.mfaVerify.verifyButton' })).toBeDisabled();
    });

    it('verificationCodeが6桁の場合、送信ボタンがenabledになる', () => {
      renderForm({ verificationCode: '123456' });

      expect(screen.getByRole('button', { name: 'auth.mfaVerify.verifyButton' })).toBeEnabled();
    });

    it('6桁入力でonVerifyTotpが呼ばれる', async () => {
      const onVerifyTotp = vi.fn();
      render(<ControlledTotpForm onVerifyTotp={onVerifyTotp} />);

      const otpInput = screen.getByLabelText('auth.mfaVerify.verificationCode');
      fireEvent.change(otpInput, { target: { value: '123456' } });

      expect(onVerifyTotp).toHaveBeenCalledTimes(1);
    });

    it('isVerifying=trueの場合、送信ボタンがloading表示になる', () => {
      renderForm({ verificationCode: '123456', isVerifying: true });

      const button = screen.getByRole('button', { name: 'auth.mfaVerify.verifying' });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('aria-busy', 'true');
    });

    it("「useRecoveryCode」ボタンでonSwitchMode('recovery')が呼ばれる", async () => {
      const user = userEvent.setup();
      const onSwitchMode = vi.fn();
      renderForm({ onSwitchMode });

      await user.click(screen.getByRole('button', { name: 'auth.mfaVerify.useRecoveryCode' }));

      expect(onSwitchMode).toHaveBeenCalledWith('recovery');
    });
  });

  describe('recoveryモード', () => {
    it('recoveryCodeが空の場合、送信ボタンがdisabledになる', () => {
      renderForm({ mode: 'recovery', recoveryCode: '' });

      expect(
        screen.getByRole('button', { name: 'auth.mfaVerify.useRecoveryCodeButton' }),
      ).toBeDisabled();
    });

    it('recoveryCodeが空白のみの場合、送信ボタンがdisabledになる', () => {
      renderForm({ mode: 'recovery', recoveryCode: '   ' });

      expect(
        screen.getByRole('button', { name: 'auth.mfaVerify.useRecoveryCodeButton' }),
      ).toBeDisabled();
    });

    it('recoveryCodeが入力されている場合、送信ボタンがenabledになる', () => {
      renderForm({ mode: 'recovery', recoveryCode: 'ABCD-1234' });

      expect(
        screen.getByRole('button', { name: 'auth.mfaVerify.useRecoveryCodeButton' }),
      ).toBeEnabled();
    });

    it('入力値を大文字変換してonRecoveryCodeChangeに渡す', () => {
      const onRecoveryCodeChange = vi.fn();
      renderForm({ mode: 'recovery', onRecoveryCodeChange });

      const input = screen.getByLabelText('auth.mfaVerify.recoveryCodeInput');
      fireEvent.change(input, { target: { value: 'abcd-1234' } });

      expect(onRecoveryCodeChange).toHaveBeenCalledWith('ABCD-1234');
    });

    it('Enterキー押下でonVerifyRecoveryが呼ばれる', () => {
      const onVerifyRecovery = vi.fn();
      renderForm({ mode: 'recovery', recoveryCode: 'ABCD-1234', onVerifyRecovery });

      const input = screen.getByLabelText('auth.mfaVerify.recoveryCodeInput');
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(onVerifyRecovery).toHaveBeenCalledTimes(1);
    });

    it("「switchToTotp」ボタンでonSwitchMode('totp')が呼ばれる", async () => {
      const user = userEvent.setup();
      const onSwitchMode = vi.fn();
      renderForm({ mode: 'recovery', onSwitchMode });

      await user.click(screen.getByRole('button', { name: 'auth.mfaVerify.switchToTotp' }));

      expect(onSwitchMode).toHaveBeenCalledWith('totp');
    });

    it('isVerifying=trueの場合、送信ボタンがloading表示になる', () => {
      renderForm({ mode: 'recovery', recoveryCode: 'ABCD-1234', isVerifying: true });

      const button = screen.getByRole('button', { name: 'auth.mfaVerify.verifying' });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('aria-busy', 'true');
    });
  });

  describe('flow分岐（#2013: passwordResetからの再利用）', () => {
    it("flow='login'ではbackToLoginラベルとlogin用hrefを出す", () => {
      renderForm({ flow: 'login' });

      const link = screen.getByRole('link', { name: 'auth.mfaVerify.backToLogin' });
      expect(link).toHaveAttribute('href', '/ja/auth/login');
    });

    it("flow='passwordReset'ではbackToPasswordResetラベルを出す（ログインへの誤誘導をしない）", () => {
      renderForm({ flow: 'passwordReset' });

      expect(
        screen.getByRole('link', { name: 'auth.mfaVerify.backToPasswordReset' }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('link', { name: 'auth.mfaVerify.backToLogin' }),
      ).not.toBeInTheDocument();
    });

    it("flow='passwordReset'かつrecoveryモードでは、ログインを前提としない説明文を出す", () => {
      renderForm({ flow: 'passwordReset', mode: 'recovery' });

      expect(
        screen.getByText('auth.mfaVerify.recoveryCodeDescriptionPasswordReset'),
      ).toBeInTheDocument();
    });
  });

  describe('エラー表示', () => {
    it('errorが渡された場合、role="alert"で表示される', () => {
      renderForm({ error: 'コードが正しくありません' });

      expect(screen.getByRole('alert')).toHaveTextContent('コードが正しくありません');
    });

    it('errorがnullの場合、alertは表示されない', () => {
      renderForm({ error: null });

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });
});
