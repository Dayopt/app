/**
 * Email Templates Storybook Stories
 *
 * React Email は完全な HTML文書を生成するため、
 * render() で HTML文字列に変換し iframe の srcDoc で表示する。
 *
 * Auth メール: supabase/functions/send-auth-email/ (Deno用コピー)
 * アプリメール + Storybook用コピー: src/emails/
 */

import { useEffect, useState } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { render } from 'react-email';

import { AccountDeletionEmail } from './AccountDeletionEmail';
import { CancellationConfirmEmail } from './CancellationConfirmEmail';
import { ConfirmEmail } from './ConfirmEmail';
import { MagicLinkEmail } from './MagicLinkEmail';
import { PasswordChangedEmail } from './PasswordChangedEmail';
import { PasswordResetEmail } from './PasswordResetEmail';
import { PaymentFailedEmail } from './PaymentFailedEmail';
import { PaymentRecoveredEmail } from './PaymentRecoveredEmail';
import { ProStartEmail } from './ProStartEmail';
import { colors } from './styles';
import { TrialExpiredEmail } from './TrialExpiredEmail';
import { TrialExpiringEmail } from './TrialExpiringEmail';
import { TrialStartEmail } from './TrialStartEmail';
import { WelcomeEmail } from './WelcomeEmail';

const meta = {
  title: 'Product/Emails',
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

/**
 * React Email を iframe でプレビュー（render() が async のため state で管理）
 */
function EmailPreview({ element, title }: { element: React.ReactElement; title: string }) {
  const [html, setHtml] = useState('');

  useEffect(() => {
    render(element).then(setHtml);
  }, [element]);

  if (!html) {
    return <p className="p-4 text-sm">Loading...</p>;
  }

  return (
    <div className="p-4">
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      <iframe
        title={title}
        srcDoc={html}
        style={{
          width: '100%',
          height: '600px',
          border: '1px solid var(--border)',
          borderRadius: '8px',
        }}
      />
    </div>
  );
}

/**
 * EN / JA 両ロケールを並べてプレビュー
 */
function BilingualEmailPreview({
  enElement,
  jaElement,
  title,
}: {
  enElement: React.ReactElement;
  jaElement: React.ReactElement;
  title: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-0">
      <EmailPreview element={enElement} title={`${title} (EN)`} />
      <EmailPreview element={jaElement} title={`${title} (JA)`} />
    </div>
  );
}

/** ガイドライン: テンプレート仕様とカラートークン */
export const Guidelines: Story = {
  render: () => (
    <div className="space-y-8 p-8">
      <div>
        <h1 className="mb-2 text-2xl font-medium">Email Templates</h1>
        <p className="text-muted-foreground">Resend + React Email で管理するメールテンプレート。</p>
      </div>

      <section>
        <h2 className="border-border mb-4 border-b pb-2 text-lg font-medium">構成</h2>
        <div className="text-muted-foreground space-y-1 font-mono text-sm">
          <p className="text-foreground font-medium">
            Auth メール（Supabase Edge Function / Deno）
          </p>
          <p>supabase/functions/send-auth-email/</p>
          <p className="pl-4">index.ts — webhook検証 + renderAsync + Resend送信</p>
          <p className="pl-4">styles.tsx — 共通スタイル（tokens/colors.css トークン → hex）</p>
          <p className="pl-4">ConfirmEmail.tsx — メール確認（Auth signup）</p>
          <p className="pl-4">PasswordResetEmail.tsx — PW リセット（Auth recovery）</p>
          <p className="pl-4">MagicLinkEmail.tsx — マジックリンク（Auth magic_link）</p>
          <p className="text-foreground mt-4 font-medium">
            アプリメール（tRPC email router / Node.js）
          </p>
          <p>src/emails/</p>
          <p className="pl-4">styles.ts — 共通スタイル（Edge Function側と同一値を維持）</p>
          <p className="pl-4">WelcomeEmail.tsx — 新規登録</p>
          <p className="pl-4">TrialStartEmail.tsx — トライアル開始</p>
          <p className="pl-4">TrialExpiringEmail.tsx — トライアル残3日</p>
          <p className="pl-4">TrialExpiredEmail.tsx — トライアル期限切れ</p>
          <p className="pl-4">ProStartEmail.tsx — Pro開始</p>
          <p className="pl-4">PaymentFailedEmail.tsx — 支払い失敗</p>
          <p className="pl-4">PaymentRecoveredEmail.tsx — 支払い復旧</p>
          <p className="pl-4">PasswordChangedEmail.tsx — PW変更通知</p>
          <p className="pl-4">CancellationConfirmEmail.tsx — Pro解約確認</p>
          <p className="pl-4">AccountDeletionEmail.tsx — アカウント削除（GDPR）</p>
          <p className="text-muted-foreground mt-4 text-xs">
            ※ Auth テンプレート3つは Storybook プレビュー用に src/emails/ にもコピーが存在。
            Deno/Node.js のランタイム差異により共有不可のため、変更時は両方を更新すること。
          </p>
        </div>
      </section>

      <section>
        <h2 className="border-border mb-4 border-b pb-2 text-lg font-medium">カラートークン</h2>
        <p className="text-muted-foreground mb-4 text-sm">
          メールクライアントは CSS変数・OKLCH 未対応のため、tokens/colors.css トークンを hex
          に変換。
        </p>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Object.entries(colors).map(([name, hex]) => (
            <div key={name} className="flex items-center gap-2">
              <div
                className="border-border size-8 shrink-0 rounded-lg border"
                style={{ backgroundColor: hex }}
              />
              <div>
                <code className="text-xs font-medium">{name}</code>
                <p className="text-muted-foreground text-xs">{hex}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="border-border mb-4 border-b pb-2 text-lg font-medium">
          テンプレートと送信フロー
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border border-b">
                <th className="py-2 text-left font-medium">テンプレート</th>
                <th className="py-2 text-left font-medium">用途</th>
                <th className="py-2 text-left font-medium">トリガー</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              {[
                ['ConfirmEmail', 'メール確認', 'Auth Hook (signup)'],
                ['PasswordResetEmail', 'PW リセット', 'Auth Hook (recovery)'],
                ['MagicLinkEmail', 'マジックリンク', 'Auth Hook (magic_link)'],
                ['WelcomeEmail', '新規登録', 'email.sendWelcome'],
                ['TrialStartEmail', 'トライアル開始', 'email.sendTrialStart'],
                ['TrialExpiringEmail', 'トライアル残3日', 'email.sendTrialExpiring'],
                ['TrialExpiredEmail', 'トライアル期限切れ', 'email.sendTrialExpired'],
                ['ProStartEmail', 'Pro開始', 'email.sendProStart'],
                ['PaymentFailedEmail', '支払い失敗', 'email.sendPaymentFailed'],
                ['PaymentRecoveredEmail', '支払い復旧', 'email.sendPaymentRecovered'],
                ['PasswordChangedEmail', 'PW変更通知', 'email.sendPasswordChanged'],
                ['CancellationConfirmEmail', 'Pro解約確認', 'email.sendCancellationConfirm'],
                ['AccountDeletionEmail', 'アカウント削除', 'email.sendAccountDeletion'],
              ].map(([name, use, trigger]) => (
                <tr key={name} className="border-border border-b">
                  <td className="py-2">
                    <code>{name}</code>
                  </td>
                  <td className="py-2">{use}</td>
                  <td className="py-2">
                    <code className="text-xs">{trigger}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="border-border mb-4 border-b pb-2 text-lg font-medium">送信フロー</h2>
        <div className="text-muted-foreground space-y-4 text-sm">
          <div>
            <h3 className="text-foreground mb-2 text-sm font-medium">
              Auth メール（signup / reset / magic_link）
            </h3>
            <div className="bg-muted rounded-lg p-4 font-mono text-xs">
              <p>Supabase Auth → send_email hook → Edge Function</p>
              <p className="pl-4">→ supabase/functions/send-auth-email/index.ts</p>
              <p className="pl-4">→ React Email renderAsync → Resend API → ユーザー</p>
            </div>
          </div>
          <div>
            <h3 className="text-foreground mb-2 text-sm font-medium">
              アプリメール（welcome / trial / pro / billing / deletion）
            </h3>
            <div className="bg-muted rounded-lg p-4 font-mono text-xs">
              <p>App → tRPC email.sendXxx → React Email render</p>
              <p className="pl-4">→ src/lib/email/router.ts</p>
              <p className="pl-4">→ Resend API → ユーザー</p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="border-border mb-4 border-b pb-2 text-lg font-medium">デザインルール</h2>
        <ul className="text-muted-foreground list-disc space-y-2 pl-6 text-sm">
          <li>Auth / アプリ両方で styles.ts の共通スタイルを使用（同一値を維持）</li>
          <li>メールはライトモード固定（ダークモード未対応）</li>
          <li>CTA ボタンは1メールにつき1つ（明確なアクション）</li>
          <li>パスワードリセット等はフォールバックURL（コピペ用）を表示</li>
          <li>maxWidth: 580px（モバイル表示を考慮）</li>
        </ul>
      </section>
    </div>
  ),
};

/** ウェルカムメール */
export const Welcome: Story = {
  render: () => (
    <BilingualEmailPreview
      enElement={WelcomeEmail({ userName: 'Tomoya', locale: 'en' })}
      jaElement={WelcomeEmail({ userName: 'Tomoya', locale: 'ja' })}
      title="Welcome"
    />
  ),
};

/** メール確認 */
export const Confirm: Story = {
  render: () => (
    <BilingualEmailPreview
      enElement={ConfirmEmail({
        userName: 'Tomoya',
        confirmUrl: 'https://app.dayopt.app/auth/confirm?token=abc123',
        locale: 'en',
      })}
      jaElement={ConfirmEmail({
        userName: 'Tomoya',
        confirmUrl: 'https://app.dayopt.app/auth/confirm?token=abc123',
        locale: 'ja',
      })}
      title="Confirm Email"
    />
  ),
};

/** パスワードリセット */
export const PasswordReset: Story = {
  render: () => (
    <BilingualEmailPreview
      enElement={PasswordResetEmail({
        userName: 'Tomoya',
        resetUrl: 'https://app.dayopt.app/auth/reset?token=abc123',
        locale: 'en',
      })}
      jaElement={PasswordResetEmail({
        userName: 'Tomoya',
        resetUrl: 'https://app.dayopt.app/auth/reset?token=abc123',
        locale: 'ja',
      })}
      title="Password Reset"
    />
  ),
};

/** マジックリンク */
export const MagicLink: Story = {
  render: () => (
    <BilingualEmailPreview
      enElement={MagicLinkEmail({
        loginUrl: 'https://app.dayopt.app/auth/magic-link?token=abc123',
        locale: 'en',
      })}
      jaElement={MagicLinkEmail({
        loginUrl: 'https://app.dayopt.app/auth/magic-link?token=abc123',
        locale: 'ja',
      })}
      title="Magic Link"
    />
  ),
};

/** トライアル開始 */
export const TrialStart: Story = {
  render: () => (
    <BilingualEmailPreview
      enElement={TrialStartEmail({
        userName: 'Tomoya',
        trialEndDate: 'March 30, 2026',
        locale: 'en',
      })}
      jaElement={TrialStartEmail({
        userName: 'Tomoya',
        trialEndDate: '2026年3月30日',
        locale: 'ja',
      })}
      title="Trial Start"
    />
  ),
};

/** トライアル残3日 */
export const TrialExpiring: Story = {
  render: () => (
    <BilingualEmailPreview
      enElement={TrialExpiringEmail({
        userName: 'Tomoya',
        trialEndDate: 'March 30, 2026',
        locale: 'en',
      })}
      jaElement={TrialExpiringEmail({
        userName: 'Tomoya',
        trialEndDate: '2026年3月30日',
        locale: 'ja',
      })}
      title="Trial Expiring"
    />
  ),
};

/** トライアル期限切れ */
export const TrialExpired: Story = {
  render: () => (
    <BilingualEmailPreview
      enElement={TrialExpiredEmail({ userName: 'Tomoya', locale: 'en' })}
      jaElement={TrialExpiredEmail({ userName: 'Tomoya', locale: 'ja' })}
      title="Trial Expired"
    />
  ),
};

/** Pro開始 */
export const ProStart: Story = {
  render: () => (
    <BilingualEmailPreview
      enElement={ProStartEmail({ userName: 'Tomoya', locale: 'en' })}
      jaElement={ProStartEmail({ userName: 'Tomoya', locale: 'ja' })}
      title="Pro Start"
    />
  ),
};

/** 支払い失敗 */
export const PaymentFailed: Story = {
  render: () => (
    <BilingualEmailPreview
      enElement={PaymentFailedEmail({ userName: 'Tomoya', locale: 'en' })}
      jaElement={PaymentFailedEmail({ userName: 'Tomoya', locale: 'ja' })}
      title="Payment Failed"
    />
  ),
};

/** 支払い復旧 */
export const PaymentRecovered: Story = {
  render: () => (
    <BilingualEmailPreview
      enElement={PaymentRecoveredEmail({ userName: 'Tomoya', locale: 'en' })}
      jaElement={PaymentRecoveredEmail({ userName: 'Tomoya', locale: 'ja' })}
      title="Payment Recovered"
    />
  ),
};

/** パスワード変更通知 */
export const PasswordChanged: Story = {
  render: () => (
    <BilingualEmailPreview
      enElement={PasswordChangedEmail({ userName: 'Tomoya', locale: 'en' })}
      jaElement={PasswordChangedEmail({ userName: 'Tomoya', locale: 'ja' })}
      title="Password Changed"
    />
  ),
};

/** Pro解約確認 */
export const CancellationConfirm: Story = {
  render: () => (
    <BilingualEmailPreview
      enElement={CancellationConfirmEmail({
        userName: 'Tomoya',
        periodEndDate: 'April 23, 2026',
        locale: 'en',
      })}
      jaElement={CancellationConfirmEmail({
        userName: 'Tomoya',
        periodEndDate: '2026年4月23日',
        locale: 'ja',
      })}
      title="Cancellation Confirm"
    />
  ),
};

/** アカウント削除確認 */
export const AccountDeletion: Story = {
  render: () => (
    <BilingualEmailPreview
      enElement={AccountDeletionEmail({
        userName: 'Tomoya',
        deletionDate: 'February 24, 2026',
        locale: 'en',
      })}
      jaElement={AccountDeletionEmail({
        userName: 'Tomoya',
        deletionDate: '2026年2月24日',
        locale: 'ja',
      })}
      title="Account Deletion"
    />
  ),
};
