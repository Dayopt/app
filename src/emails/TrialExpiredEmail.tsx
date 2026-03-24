/**
 * Trial Expired Email Template
 * トライアル期限切れ時に送信
 *
 * トリガー: customer.subscription.updated (trialing → canceled/free)
 */

import { Body, Button, Container, Head, Html, Section, Text } from '@react-email/components';

import * as styles from './styles';

export interface TrialExpiredEmailProps {
  userName: string;
  appUrl?: string;
}

export function TrialExpiredEmail({
  userName,
  appUrl = 'https://dayopt.app',
}: TrialExpiredEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={styles.main}>
        <Container style={styles.container}>
          <Section style={styles.section}>
            <Text style={styles.heading}>Your Pro trial has ended</Text>
            <Text style={styles.paragraph}>Hi {userName || 'there'},</Text>
            <Text style={styles.paragraph}>
              Your 7-day Pro trial has ended, and your account is now on the Free plan.
            </Text>
            <Text style={styles.paragraph}>You still have full access to:</Text>
            <Section style={styles.infoBox}>
              <Text style={{ ...styles.paragraph, margin: '0 0 8px' }}>
                - Timeboxing and daily planning
              </Text>
              <Text style={{ ...styles.paragraph, margin: '0 0 8px' }}>
                - Time tracking and records
              </Text>
              <Text style={{ ...styles.paragraph, margin: '0' }}>- Calendar views</Text>
            </Section>
            <Text style={styles.paragraph}>
              If you&apos;d like to unlock analytics, unlimited tags, and more, you can upgrade to
              Pro anytime.
            </Text>
            <Button style={styles.button} href={`${appUrl}/settings/billing`}>
              Upgrade to Pro
            </Button>
            <Text style={styles.footer}>
              Thanks for trying Pro.
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

export default TrialExpiredEmail;
