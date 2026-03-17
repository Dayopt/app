/**
 * Password Reset Email Template
 * パスワードリセットリクエスト時のメール
 *
 * Supabase Auth の recovery フローで使用
 */

import { Body, Button, Container, Head, Html, Link, Section, Text } from '@react-email/components';

import * as styles from './styles.tsx';

export interface PasswordResetEmailProps {
  userName: string;
  resetUrl: string;
  appUrl?: string;
}

export function PasswordResetEmail({
  userName,
  resetUrl,
  appUrl = 'https://dayopt.app',
}: PasswordResetEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={styles.main}>
        <Container style={styles.container}>
          <Section style={styles.section}>
            <Text style={styles.heading}>Reset your password</Text>
            <Text style={styles.paragraph}>Hi {userName || 'there'},</Text>
            <Text style={styles.paragraph}>
              We received a request to reset your Dayopt password. Click the button below to choose
              a new password.
            </Text>
            <Button style={styles.button} href={resetUrl}>
              Reset Password
            </Button>
            <Text style={styles.smallText}>
              If the button doesn&apos;t work, copy and paste this link into your browser:
            </Text>
            <Text style={{ ...styles.smallText, wordBreak: 'break-all' }}>
              <Link style={styles.link} href={resetUrl}>
                {resetUrl}
              </Link>
            </Text>
            <Text style={styles.smallText}>This link will expire in 24 hours.</Text>
            <Text style={styles.footer}>
              If you didn&apos;t request a password reset, you can safely ignore this email. Your
              password will remain unchanged.
              <br />
              <br />
              If you&apos;re concerned about your account security, please visit{' '}
              <Link style={styles.link} href={`${appUrl}/settings/profile`}>
                your settings
              </Link>{' '}
              to update your password.
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
