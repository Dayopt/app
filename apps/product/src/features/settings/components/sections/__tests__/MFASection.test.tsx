import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { UseMFAReturn } from '../../../hooks/useMFA';
import { MFASection } from '../MFASection';

// next-intl はグローバル setup（src/lib/test/setup-node.ts）で key passthrough 済み。
// `_useMFAHook` DI seam に UseMFAReturn 形のモックを注入する。
// MFASection.stories.tsx の createMockMFA と同型だが、stories からは import しない。

function createMockMFA(overrides: Partial<UseMFAReturn> = {}): UseMFAReturn {
  return {
    hasMFA: false,
    showMFASetup: false,
    qrCode: null,
    secret: null,
    factorId: null,
    verificationCode: '',
    error: null,
    success: null,
    isLoading: false,
    recoveryCodes: null,
    recoveryCodeCount: 0,
    showDisableDialog: false,
    showRegenerateDialog: false,
    setVerificationCode: vi.fn(),
    enrollMFA: vi.fn(),
    verifyMFA: vi.fn(),
    requestDisableMFA: vi.fn(),
    confirmDisableMFA: vi.fn(),
    cancelDisableMFA: vi.fn(),
    cancelSetup: vi.fn(),
    requestRegenerateRecoveryCodes: vi.fn(),
    confirmRegenerateRecoveryCodes: vi.fn(),
    cancelRegenerateRecoveryCodes: vi.fn(),
    dismissRecoveryCodes: vi.fn(),
    ...overrides,
  };
}

function renderSection(overrides: Partial<UseMFAReturn> = {}) {
  return render(<MFASection _useMFAHook={() => createMockMFA(overrides)} />);
}

describe('MFASection', () => {
  describe('表示分岐', () => {
    it('未設定状態では有効化CTAを表示する', () => {
      renderSection();

      expect(
        screen.getByRole('button', { name: 'settings.account.mfa.enableMFA' }),
      ).toBeInTheDocument();
      expect(screen.queryByAltText('QR Code')).not.toBeInTheDocument();
    });

    it('setup中はQRコード・InputOTP・確認/キャンセルボタンを表示する', () => {
      renderSection({
        showMFASetup: true,
        qrCode: 'data:image/png;base64,MOCK',
        secret: 'SECRET123',
        factorId: 'factor-1',
      });

      expect(screen.getByAltText('QR Code')).toBeInTheDocument();
      expect(screen.getByLabelText('Verification code')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'settings.account.mfa.verify' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'settings.account.mfa.cancel' }),
      ).toBeInTheDocument();
      expect(screen.getByText('SECRET123')).toBeInTheDocument();
    });

    it('有効かつrecoveryCodes未表示の場合、有効化済み表示とリカバリーコード残数を表示する', () => {
      renderSection({ hasMFA: true, recoveryCodeCount: 8 });

      expect(screen.getByText('settings.account.mfa.enabled.title')).toBeInTheDocument();
      expect(screen.getByText('settings.account.mfa.recoveryCodes.remaining')).toBeInTheDocument();
      expect(
        screen.queryByText('settings.account.mfa.recoveryCodes.noCodesLeft'),
      ).not.toBeInTheDocument();
    });

    it('recoveryCodeCountが0の場合、destructive警告を表示する', () => {
      renderSection({ hasMFA: true, recoveryCodeCount: 0 });

      expect(
        screen.getByText('settings.account.mfa.recoveryCodes.noCodesLeft'),
      ).toBeInTheDocument();
      expect(
        screen.getByText('settings.account.mfa.recoveryCodes.exhaustedWarning'),
      ).toBeInTheDocument();
    });

    it('recoveryCodesが非nullの場合、コード一覧と保存ボタンを表示する', () => {
      renderSection({
        hasMFA: true,
        recoveryCodeCount: 2,
        recoveryCodes: ['ABCD-1234', 'EFGH-5678'],
      });

      expect(screen.getByText('ABCD-1234')).toBeInTheDocument();
      expect(screen.getByText('EFGH-5678')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'settings.account.mfa.recoveryCodes.saved' }),
      ).toBeInTheDocument();
    });
  });

  describe('操作', () => {
    it('「有効にする」ボタンでenrollMFAが呼ばれる', async () => {
      const user = userEvent.setup();
      const enrollMFA = vi.fn();
      renderSection({ enrollMFA });

      await user.click(screen.getByRole('button', { name: 'settings.account.mfa.enableMFA' }));

      expect(enrollMFA).toHaveBeenCalledTimes(1);
    });

    it('setup中、verificationCodeが6桁未満の場合、確認ボタンがdisabledになる', () => {
      renderSection({
        showMFASetup: true,
        qrCode: 'data:image/png;base64,MOCK',
        factorId: 'factor-1',
        verificationCode: '12345',
      });

      expect(screen.getByRole('button', { name: 'settings.account.mfa.verify' })).toBeDisabled();
    });

    it('setup中、verificationCodeが6桁の場合、確認ボタンがenabledになる', () => {
      renderSection({
        showMFASetup: true,
        qrCode: 'data:image/png;base64,MOCK',
        factorId: 'factor-1',
        verificationCode: '123456',
      });

      expect(screen.getByRole('button', { name: 'settings.account.mfa.verify' })).toBeEnabled();
    });

    it('setup中、isLoading=trueの場合、確認ボタンがdisabledになる', () => {
      renderSection({
        showMFASetup: true,
        qrCode: 'data:image/png;base64,MOCK',
        factorId: 'factor-1',
        verificationCode: '123456',
        isLoading: true,
      });

      expect(screen.getByRole('button', { name: 'settings.account.mfa.verifying' })).toBeDisabled();
    });

    it('setup中、キャンセルボタンでcancelSetupが呼ばれる', async () => {
      const user = userEvent.setup();
      const cancelSetup = vi.fn();
      renderSection({
        showMFASetup: true,
        qrCode: 'data:image/png;base64,MOCK',
        factorId: 'factor-1',
        cancelSetup,
      });

      await user.click(screen.getByRole('button', { name: 'settings.account.mfa.cancel' }));

      expect(cancelSetup).toHaveBeenCalledTimes(1);
    });

    it('無効化ボタンでrequestDisableMFAが呼ばれる', async () => {
      const user = userEvent.setup();
      const requestDisableMFA = vi.fn();
      renderSection({ hasMFA: true, recoveryCodeCount: 8, requestDisableMFA });

      await user.click(screen.getByRole('button', { name: 'settings.account.mfa.disableMFA' }));

      expect(requestDisableMFA).toHaveBeenCalledTimes(1);
    });

    it('無効化ダイアログ: disableCodeが6桁未満の場合、実行ボタンがdisabledになる', () => {
      renderSection({ hasMFA: true, recoveryCodeCount: 8, showDisableDialog: true });

      // セクション側の同名ボタンと区別するため、ダイアログ内にスコープを限定する。
      // なお「6桁入力で enabled」の正常系は、InputOTP の onComplete が 6 桁到達で即
      // confirmDisableMFA を呼び入力をリセットするため UI 上到達不能であり、テストしない。
      const dialog = screen.getByRole('alertdialog');
      expect(
        within(dialog).getByRole('button', { name: 'settings.account.mfa.disableMFA' }),
      ).toBeDisabled();
    });

    it('無効化ダイアログ: 6桁入力でconfirmDisableMFAが呼ばれる（onComplete経由）', () => {
      const confirmDisableMFA = vi.fn();
      renderSection({
        hasMFA: true,
        recoveryCodeCount: 8,
        showDisableDialog: true,
        confirmDisableMFA,
      });

      const otpInput = screen.getByLabelText('Disable MFA code');
      fireEvent.change(otpInput, { target: { value: '123456' } });

      expect(confirmDisableMFA).toHaveBeenCalledWith('123456');
    });

    it('「保存しました」ボタンでdismissRecoveryCodesが呼ばれる', async () => {
      const user = userEvent.setup();
      const dismissRecoveryCodes = vi.fn();
      renderSection({
        hasMFA: true,
        recoveryCodeCount: 2,
        recoveryCodes: ['ABCD-1234'],
        dismissRecoveryCodes,
      });

      await user.click(
        screen.getByRole('button', { name: 'settings.account.mfa.recoveryCodes.saved' }),
      );

      expect(dismissRecoveryCodes).toHaveBeenCalledTimes(1);
    });
  });
});
