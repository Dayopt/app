import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import type { UseMFAReturn } from '../../hooks/useMFA';
import { MFASection } from './MFASection';

// ─────────────────────────────────────────────────────────
// モックファクトリ
// ─────────────────────────────────────────────────────────

/**
 * useMFA フックのモック返却値を生成するヘルパー。
 *
 * MFASection は Supabase Auth MFA API を直接呼ぶため tRPC でモック不可。
 * `_useMFAHook` prop 経由で差し替えることで実コンポーネントをそのまま描画できる。
 */
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
    setVerificationCode: fn(),
    enrollMFA: fn(),
    verifyMFA: fn(),
    requestDisableMFA: fn(),
    confirmDisableMFA: fn(),
    cancelDisableMFA: fn(),
    cancelSetup: fn(),
    requestRegenerateRecoveryCodes: fn(),
    confirmRegenerateRecoveryCodes: fn(),
    cancelRegenerateRecoveryCodes: fn(),
    dismissRecoveryCodes: fn(),
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────

/**
 * MFASection - 二段階認証（TOTP）の登録・管理 UI
 *
 * `_useMFAHook` は関数 prop のため Storybook の args 型推論対象外。
 * `satisfies Meta` (型引数なし) を使い、component フィールドで autodocs を有効にしつつ
 * render 関数内で直接 prop を渡す。
 */
const meta = {
  title: 'Product/Features/Settings/MFASection',
  component: MFASection,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** MFA未設定状態。「有効にする」ボタンを表示。 */
export const Disabled: Story = {
  render: () => <MFASection _useMFAHook={() => createMockMFA()} />,
};

/** MFA登録中（QRコード表示）状態。 */
export const Setup: Story = {
  render: () => (
    <MFASection
      _useMFAHook={() =>
        createMockMFA({
          showMFASetup: true,
          // 1x1 透明PNG（QRコードのプレースホルダー）
          qrCode:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          secret: 'JBSWY3DPEHPK3PXP',
          factorId: 'factor-demo-id',
        })
      }
    />
  ),
};

/** MFA設定中・認証コード入力済み状態。認証ボタンが活性化。 */
export const SetupWithCode: Story = {
  render: () => (
    <MFASection
      _useMFAHook={() =>
        createMockMFA({
          showMFASetup: true,
          qrCode:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          secret: 'JBSWY3DPEHPK3PXP',
          factorId: 'factor-demo-id',
          verificationCode: '123456',
        })
      }
    />
  ),
};

/** MFA有効、リカバリーコード残り8個。 */
export const EnabledWithCodes: Story = {
  render: () => (
    <MFASection _useMFAHook={() => createMockMFA({ hasMFA: true, recoveryCodeCount: 8 })} />
  ),
};

/** MFA有効、リカバリーコード残り2個（少数）。 */
export const EnabledFewCodes: Story = {
  render: () => (
    <MFASection _useMFAHook={() => createMockMFA({ hasMFA: true, recoveryCodeCount: 2 })} />
  ),
};

/** MFA有効、リカバリーコード枯渇（0個）。destructive 警告を表示。 */
export const EnabledExhausted: Story = {
  render: () => (
    <MFASection _useMFAHook={() => createMockMFA({ hasMFA: true, recoveryCodeCount: 0 })} />
  ),
};

/**
 * MFA有効化直後のリカバリーコード表示。
 * 各コードは1回のみ使用可能で、この画面を閉じると再表示不可。
 */
export const RecoveryCodesDisplay: Story = {
  render: () => (
    <MFASection
      _useMFAHook={() =>
        createMockMFA({
          hasMFA: true,
          recoveryCodeCount: 10,
          success: '二段階認証が有効になりました',
          recoveryCodes: [
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
          ],
        })
      }
    />
  ),
};

/** MFA無効化確認ダイアログ表示中。OTP入力フォーム付き。 */
export const DisableDialog: Story = {
  render: () => (
    <MFASection
      _useMFAHook={() =>
        createMockMFA({
          hasMFA: true,
          recoveryCodeCount: 8,
          showDisableDialog: true,
        })
      }
    />
  ),
};

/** リカバリーコード再生成確認ダイアログ表示中。 */
export const RegenerateDialog: Story = {
  render: () => (
    <MFASection
      _useMFAHook={() =>
        createMockMFA({
          hasMFA: true,
          recoveryCodeCount: 3,
          showRegenerateDialog: true,
        })
      }
    />
  ),
};

/** エラー状態。認証コード入力ミス時など。 */
export const WithError: Story = {
  render: () => (
    <MFASection
      _useMFAHook={() =>
        createMockMFA({
          showMFASetup: true,
          qrCode:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          secret: 'JBSWY3DPEHPK3PXP',
          factorId: 'factor-demo-id',
          error: '認証コードが正しくありません。再度お試しください。',
        })
      }
    />
  ),
};

/** 処理中（isLoading）状態。ボタンが無効化されスピナー表示。 */
export const Loading: Story = {
  render: () => <MFASection _useMFAHook={() => createMockMFA({ isLoading: true })} />,
};

/** 全パターン一覧（ダイアログ除く）。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex max-w-2xl flex-col items-start gap-6">
      <MFASection _useMFAHook={() => createMockMFA()} />
      <MFASection
        _useMFAHook={() =>
          createMockMFA({
            showMFASetup: true,
            qrCode:
              'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            secret: 'JBSWY3DPEHPK3PXP',
            factorId: 'factor-demo-id',
          })
        }
      />
      <MFASection _useMFAHook={() => createMockMFA({ hasMFA: true, recoveryCodeCount: 8 })} />
      <MFASection _useMFAHook={() => createMockMFA({ hasMFA: true, recoveryCodeCount: 2 })} />
      <MFASection _useMFAHook={() => createMockMFA({ hasMFA: true, recoveryCodeCount: 0 })} />
      <MFASection
        _useMFAHook={() =>
          createMockMFA({
            hasMFA: true,
            recoveryCodeCount: 10,
            recoveryCodes: [
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
            ],
          })
        }
      />
    </div>
  ),
};
