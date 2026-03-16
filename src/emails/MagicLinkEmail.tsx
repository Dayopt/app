/**
 * Magic Link Email Template
 * マジックリンクログイン時のメール
 *
 * Supabase Auth の magic_link フローで使用
 * NOTE: supabase/functions/send-auth-email/MagicLinkEmail.tsx と同一内容を維持
 */

import { Body, Button, Container, Head, Html, Link, Section, Text } from '@react-email/components';

import * as styles from './styles';

export interface MagicLinkEmailProps {
  loginUrl: string;
  appUrl?: string;
}

export function MagicLinkEmail({ loginUrl, appUrl = 'https://dayopt.app' }: MagicLinkEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={styles.main}>
        <Container style={styles.container}>
          <Section style={styles.section}>
            <Text style={styles.heading}>Log in to Dayopt</Text>
            <Text style={styles.paragraph}>
              Click the button below to log in to your Dayopt account. No password needed.
            </Text>
            <Button style={styles.button} href={loginUrl}>
              Log In to Dayopt
            </Button>
            <Text style={styles.smallText}>
              If the button doesn&apos;t work, copy and paste this link into your browser:
            </Text>
            <Text style={{ ...styles.smallText, wordBreak: 'break-all' }}>
              <Link style={styles.link} href={loginUrl}>
                {loginUrl}
              </Link>
            </Text>
            <Text style={styles.smallText}>This link will expire in 1 hour.</Text>
            <Text style={styles.footer}>
              If you didn&apos;t request this login link, you can safely ignore this email. Someone
              may have entered your email address by mistake.
              <br />
              <br />
              <Link style={styles.link} href={appUrl}>
                dayopt.app
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

export default MagicLinkEmail;
