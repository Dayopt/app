import type { ReactElement } from 'react';

import { render } from 'react-email';
import { describe, expect, it } from 'vitest';

import { AccountDeletionEmail } from './AccountDeletionEmail';
import { CancellationConfirmEmail } from './CancellationConfirmEmail';
import { ConfirmEmail } from './ConfirmEmail';
import { MagicLinkEmail } from './MagicLinkEmail';
import { PasswordChangedEmail } from './PasswordChangedEmail';
import { PasswordResetEmail } from './PasswordResetEmail';
import { PaymentFailedEmail } from './PaymentFailedEmail';
import { PaymentRecoveredEmail } from './PaymentRecoveredEmail';
import { ProStartEmail } from './ProStartEmail';
import { TrialExpiredEmail } from './TrialExpiredEmail';
import { TrialExpiringEmail } from './TrialExpiringEmail';
import { TrialStartEmail } from './TrialStartEmail';
import { WelcomeEmail } from './WelcomeEmail';

type EmailFixture = {
  name: string;
  element: ReactElement;
};

function createEmailFixtures(locale: 'en' | 'ja'): EmailFixture[] {
  return [
    {
      name: `WelcomeEmail (${locale})`,
      element: WelcomeEmail({ userName: 'Tomoya', locale }),
    },
    {
      name: `ConfirmEmail (${locale})`,
      element: ConfirmEmail({
        userName: 'Tomoya',
        confirmUrl: 'https://app.dayopt.app/auth/confirm?token=test',
        locale,
      }),
    },
    {
      name: `PasswordResetEmail (${locale})`,
      element: PasswordResetEmail({
        userName: 'Tomoya',
        resetUrl: 'https://app.dayopt.app/auth/reset?token=test',
        locale,
      }),
    },
    {
      name: `MagicLinkEmail (${locale})`,
      element: MagicLinkEmail({
        loginUrl: 'https://app.dayopt.app/auth/magic-link?token=test',
        locale,
      }),
    },
    {
      name: `TrialStartEmail (${locale})`,
      element: TrialStartEmail({ userName: 'Tomoya', trialEndDate: '2026-07-31', locale }),
    },
    {
      name: `TrialExpiringEmail (${locale})`,
      element: TrialExpiringEmail({ userName: 'Tomoya', trialEndDate: '2026-07-31', locale }),
    },
    {
      name: `TrialExpiredEmail (${locale})`,
      element: TrialExpiredEmail({ userName: 'Tomoya', locale }),
    },
    {
      name: `ProStartEmail (${locale})`,
      element: ProStartEmail({ userName: 'Tomoya', locale }),
    },
    {
      name: `PaymentFailedEmail (${locale})`,
      element: PaymentFailedEmail({ userName: 'Tomoya', locale }),
    },
    {
      name: `PaymentRecoveredEmail (${locale})`,
      element: PaymentRecoveredEmail({ userName: 'Tomoya', locale }),
    },
    {
      name: `PasswordChangedEmail (${locale})`,
      element: PasswordChangedEmail({ userName: 'Tomoya', locale }),
    },
    {
      name: `CancellationConfirmEmail (${locale})`,
      element: CancellationConfirmEmail({
        userName: 'Tomoya',
        periodEndDate: '2026-07-31',
        locale,
      }),
    },
    {
      name: `AccountDeletionEmail (${locale})`,
      element: AccountDeletionEmail({
        userName: 'Tomoya',
        deletionDate: '2026-07-31',
        locale,
      }),
    },
  ];
}

describe('React Email templates', () => {
  it.each([...createEmailFixtures('en'), ...createEmailFixtures('ja')])(
    'renders $name as a complete HTML document',
    async ({ element }) => {
      const html = await render(element);

      expect(html).toMatch(/<!doctype html/i);
      expect(html).toContain('<html');
      expect(html.length).toBeGreaterThan(500);
    },
  );
});
