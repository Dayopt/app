/**
 * Cancellation Confirm Email Template
 * Pro解約確認時に送信
 *
 * トリガー: customer.subscription.deleted or cancel confirmation
 */

import { Body, Button, Container, Head, Html, Section, Text } from '@react-email/components';

import * as styles from './styles';

export interface CancellationConfirmEmailProps {
  userName: string;
  /** Pro アクセス継続期限（billing period end） */
  periodEndDate: string;
  appUrl?: string;
}

export function CancellationConfirmEmail({
  userName,
  periodEndDate,
  appUrl = 'https://dayopt.app',
}: CancellationConfirmEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={styles.main}>
        <Container style={styles.container}>
          <Section style={styles.section}>
            <Text style={styles.heading}>Your Pro subscription has been canceled</Text>
            <Text style={styles.paragraph}>Hi {userName || 'there'},</Text>
            <Text style={styles.paragraph}>
              Your Pro subscription has been canceled. You&apos;ll continue to have Pro access until{' '}
              {periodEndDate}.
            </Text>
            <Section style={styles.infoBox}>
              <Text style={styles.infoBoxLabel}>Pro access until</Text>
              <Text style={styles.infoBoxValue}>{periodEndDate}</Text>
            </Section>
            <Text style={styles.paragraph}>
              After that, your account will move to the Free plan. Your data will be preserved —
              nothing is deleted.
            </Text>
            <Text style={styles.paragraph}>
              You can resubscribe anytime from Settings → Billing.
            </Text>
            <Button style={styles.button} href={`${appUrl}/settings/billing`}>
              Manage Account
            </Button>
            <Text style={styles.footer}>
              Thank you for being a Pro member.
              <br />
              <br />
              The Dayopt Team
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default CancellationConfirmEmail;
