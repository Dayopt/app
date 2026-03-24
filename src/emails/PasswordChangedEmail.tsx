/**
 * Password Changed Email Template
 * パスワード変更完了時のセキュリティ通知
 *
 * トリガー: Settings → パスワード変更成功後
 */

import { Body, Container, Head, Html, Link, Section, Text } from '@react-email/components';

import * as styles from './styles';

export interface PasswordChangedEmailProps {
  userName: string;
  appUrl?: string;
}

export function PasswordChangedEmail({
  userName,
  appUrl = 'https://dayopt.app',
}: PasswordChangedEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={styles.main}>
        <Container style={styles.container}>
          <Section style={styles.section}>
            <Text style={styles.heading}>Your password has been changed</Text>
            <Text style={styles.paragraph}>Hi {userName || 'there'},</Text>
            <Text style={styles.paragraph}>Your Dayopt password was successfully changed.</Text>
            <Text style={styles.paragraph}>
              If you didn&apos;t make this change, please reset your password immediately at{' '}
              <Link style={styles.link} href={`${appUrl}/auth/reset`}>
                {appUrl}/auth/reset
              </Link>{' '}
              and contact us at{' '}
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

export default PasswordChangedEmail;
