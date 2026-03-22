/**
 * Payment Failed Email Template
 * 支払い失敗時に送信
 *
 * トリガー: invoice.payment_failed webhook
 */

import { Body, Button, Container, Head, Html, Link, Section, Text } from '@react-email/components';

import * as styles from './styles';

export interface PaymentFailedEmailProps {
  userName: string;
  /** Stripe Customer Portal URL（動的生成） */
  portalUrl?: string;
  appUrl?: string;
}

export function PaymentFailedEmail({
  userName,
  portalUrl,
  appUrl = 'https://dayopt.app',
}: PaymentFailedEmailProps) {
  const ctaUrl = portalUrl || `${appUrl}/settings/billing`;

  return (
    <Html>
      <Head />
      <Body style={styles.main}>
        <Container style={styles.container}>
          <Section style={styles.section}>
            <Text style={styles.heading}>Action needed: payment failed</Text>
            <Text style={styles.paragraph}>Hi {userName || 'there'},</Text>
            <Text style={styles.paragraph}>
              We weren&apos;t able to process your latest payment for Dayopt Pro.
            </Text>
            <Text style={styles.paragraph}>
              Your Pro features are still active for now, but please update your payment method to
              avoid any interruption.
            </Text>
            <Button style={styles.button} href={ctaUrl}>
              Update Payment Method
            </Button>
            <Text style={styles.paragraph}>
              If you believe this is an error, or if you need help, contact us at{' '}
              <Link style={styles.link} href="mailto:support@dayopt.app">
                support@dayopt.app
              </Link>
            </Text>
            <Text style={styles.footer}>The Dayopt Team</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default PaymentFailedEmail;
