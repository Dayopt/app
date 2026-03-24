/**
 * Trial Start Email Template
 * 7日間Pro無料トライアル開始時に送信
 *
 * トリガー: checkout.session.completed (status=trialing)
 */

import { Body, Button, Container, Head, Html, Section, Text } from '@react-email/components';

import * as styles from './styles';

export interface TrialStartEmailProps {
  userName: string;
  trialEndDate: string;
  appUrl?: string;
}

export function TrialStartEmail({
  userName,
  trialEndDate,
  appUrl = 'https://dayopt.app',
}: TrialStartEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={styles.main}>
        <Container style={styles.container}>
          <Section style={styles.section}>
            <Text style={styles.heading}>Your 7-day Pro trial has started</Text>
            <Text style={styles.paragraph}>Hi {userName || 'there'},</Text>
            <Text style={styles.paragraph}>
              Your 7-day Pro trial is now active. Here&apos;s what you can explore:
            </Text>
            <Section style={styles.infoBox}>
              <Text style={styles.infoBoxLabel}>Trial ends</Text>
              <Text style={styles.infoBoxValue}>{trialEndDate}</Text>
            </Section>
            <Text style={styles.paragraph}>What&apos;s included in Pro:</Text>
            <Section style={styles.infoBox}>
              <Text style={{ ...styles.paragraph, margin: '0 0 8px' }}>
                - Full analytics and insights
              </Text>
              <Text style={{ ...styles.paragraph, margin: '0 0 8px' }}>- Unlimited tags</Text>
              <Text style={{ ...styles.paragraph, margin: '0 0 8px' }}>
                - API access and data export
              </Text>
              <Text style={{ ...styles.paragraph, margin: '0' }}>- Unlimited AI assistance</Text>
            </Section>
            <Text style={styles.paragraph}>
              No action needed — your trial starts now. If you decide Pro isn&apos;t for you,
              you&apos;ll automatically move to the Free plan when the trial ends.
            </Text>
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

export default TrialStartEmail;
