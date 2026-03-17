/**
 * Email Confirmation Template
 * 新規登録時のメールアドレス確認メール
 *
 * Supabase Auth の signup フローで使用
 * NOTE: supabase/functions/send-auth-email/ConfirmEmail.tsx と同一内容を維持
 */

import { Body, Button, Container, Head, Html, Link, Section, Text } from '@react-email/components';

import * as styles from './styles';

export interface ConfirmEmailProps {
  userName: string;
  confirmUrl: string;
  appUrl?: string;
}

export function ConfirmEmail({
  userName,
  confirmUrl,
  appUrl = 'https://dayopt.app',
}: ConfirmEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={styles.main}>
        <Container style={styles.container}>
          <Section style={styles.section}>
            <Text style={styles.heading}>Confirm your email</Text>
            <Text style={styles.paragraph}>Hi {userName || 'there'},</Text>
            <Text style={styles.paragraph}>
              Thanks for signing up for Dayopt. Please confirm your email address by clicking the
              button below.
            </Text>
            <Button style={styles.button} href={confirmUrl}>
              Confirm Email Address
            </Button>
            <Text style={styles.smallText}>
              If the button doesn&apos;t work, copy and paste this link into your browser:
            </Text>
            <Text style={{ ...styles.smallText, wordBreak: 'break-all' }}>
              <Link style={styles.link} href={confirmUrl}>
                {confirmUrl}
              </Link>
            </Text>
            <Text style={styles.footer}>
              If you didn&apos;t create an account on{' '}
              <Link style={styles.link} href={appUrl}>
                Dayopt
              </Link>
              , you can safely ignore this email.
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

export default ConfirmEmail;
