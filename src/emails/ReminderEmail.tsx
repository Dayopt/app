/**
 * Plan Reminder Email Template
 * プランリマインダー通知メール
 *
 * notification_preferences.enable_email_notifications が有効な場合に送信
 */

import { Body, Button, Container, Head, Html, Link, Section, Text } from '@react-email/components';

import * as styles from './styles';

export interface ReminderEmailProps {
  userName: string;
  planTitle: string;
  startTime: string;
  appUrl?: string;
}

export function ReminderEmail({
  userName,
  planTitle,
  startTime,
  appUrl = 'https://dayopt.app',
}: ReminderEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={styles.main}>
        <Container style={styles.container}>
          <Section style={styles.section}>
            <Text style={styles.heading}>Plan Reminder</Text>
            <Text style={styles.paragraph}>Hi {userName || 'there'},</Text>
            <Text style={styles.paragraph}>Your plan is starting now:</Text>
            <Section style={styles.infoBox}>
              <Text style={styles.infoBoxLabel}>Plan</Text>
              <Text style={styles.infoBoxValue}>{planTitle}</Text>
              <Text style={{ ...styles.infoBoxLabel, marginTop: '12px' }}>Starts at</Text>
              <Text style={styles.infoBoxValue}>{startTime}</Text>
            </Section>
            <Button style={styles.button} href={`${appUrl}/calendar`}>
              View Calendar
            </Button>
            <Text style={styles.footer}>
              You&apos;re receiving this because you enabled email notifications.{' '}
              <Link style={styles.link} href={`${appUrl}/settings/notifications`}>
                Manage notification settings
              </Link>
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

export default ReminderEmail;
