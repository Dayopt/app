/**
 * Welcome Email Template
 * 新規ユーザー登録時のウェルカムメール
 */

import { Body, Button, Container, Head, Html, Link, Section, Text } from '@react-email/components';

import * as styles from './styles';

export interface WelcomeEmailProps {
  userName: string;
  appUrl?: string;
}

export function WelcomeEmail({ userName, appUrl = 'https://dayopt.app' }: WelcomeEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={styles.main}>
        <Container style={styles.container}>
          <Section style={styles.section}>
            <Text style={styles.heading}>Welcome to Dayopt</Text>
            <Text style={styles.paragraph}>Hi {userName || 'there'},</Text>
            <Text style={styles.paragraph}>Thanks for joining Dayopt. Your account is ready.</Text>
            <Text style={styles.paragraph}>
              Dayopt combines task planning, time tracking, and calendar views in one place — so you
              can see where your time actually goes.
            </Text>
            <Button style={styles.button} href={`${appUrl}/calendar`}>
              Get Started
            </Button>
            <Text style={styles.paragraph}>
              Questions? Reach out at{' '}
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

export default WelcomeEmail;
