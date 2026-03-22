/**
 * Trial Expiring Email Template
 * トライアル残り3日で送信
 *
 * トリガー: Cron job / scheduled function (trial_end - 3日)
 */

import { Body, Button, Container, Head, Html, Section, Text } from '@react-email/components';

import * as styles from './styles';

export interface TrialExpiringEmailProps {
  userName: string;
  trialEndDate: string;
  appUrl?: string;
}

export function TrialExpiringEmail({
  userName,
  trialEndDate,
  appUrl = 'https://dayopt.app',
}: TrialExpiringEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={styles.main}>
        <Container style={styles.container}>
          <Section style={styles.section}>
            <Text style={styles.heading}>Your Pro trial ends in 3 days</Text>
            <Text style={styles.paragraph}>Hi {userName || 'there'},</Text>
            <Text style={styles.paragraph}>
              Your Pro trial ends on {trialEndDate}. After that, your account will move to the Free
              plan automatically.
            </Text>
            <Text style={styles.paragraph}>
              If you&apos;d like to keep Pro features, you can subscribe anytime from your account
              settings.
            </Text>
            <Button style={styles.button} href={`${appUrl}/settings/billing`}>
              View Plans
            </Button>
            <Text style={styles.paragraph}>
              No pressure — the Free plan still gives you full access to timeboxing, time tracking,
              and calendar views.
            </Text>
            <Text style={styles.footer}>The Dayopt Team</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default TrialExpiringEmail;
