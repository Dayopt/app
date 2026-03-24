/**
 * Payment Recovered Email Template
 * 支払いリトライ成功時に送信
 *
 * トリガー: customer.subscription.updated (past_due → active)
 */

import { Body, Button, Container, Head, Html, Section, Text } from '@react-email/components';

import * as styles from './styles';

export interface PaymentRecoveredEmailProps {
  userName: string;
  appUrl?: string;
}

export function PaymentRecoveredEmail({
  userName,
  appUrl = 'https://dayopt.app',
}: PaymentRecoveredEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={styles.main}>
        <Container style={styles.container}>
          <Section style={styles.section}>
            <Text style={styles.heading}>Payment successful — you&apos;re all set</Text>
            <Text style={styles.paragraph}>Hi {userName || 'there'},</Text>
            <Text style={styles.paragraph}>
              Good news — your latest payment for Dayopt Pro has been processed successfully. Your
              Pro access continues without interruption.
            </Text>
            <Text style={styles.paragraph}>No action is needed on your part.</Text>
            <Button style={styles.button} href={`${appUrl}/calendar`}>
              Open Dayopt
            </Button>
            <Text style={styles.footer}>The Dayopt Team</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default PaymentRecoveredEmail;
