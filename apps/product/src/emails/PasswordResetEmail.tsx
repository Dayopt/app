/**
 * Password Reset Email Template
 * パスワードリセットリクエスト時のメール
 *
 * Supabase Auth の recovery フローで使用
 * NOTE: supabase/functions/send-auth-email/PasswordResetEmail.tsx と同一内容を維持
 */

import { Body, Button, Container, Head, Html, Link, Section, Text } from '@react-email/components';

import { dayoptUrls } from '@dayopt/config';

import { createEmailTranslator, type EmailLocale } from './i18n';
import * as styles from './styles';

export interface PasswordResetEmailProps {
  userName: string;
  resetUrl: string;
  locale?: EmailLocale;
  appUrl?: string;
}

export function PasswordResetEmail({
  userName,
  resetUrl,
  locale = 'en',
  appUrl = dayoptUrls.product,
}: PasswordResetEmailProps) {
  const t = createEmailTranslator(locale);
  const settingsLinkText = t('passwordReset.yourSettings');
  const securityNote = t('passwordReset.securityNote', { settingsLink: settingsLinkText });
  const [securityBefore, securityAfter] = securityNote.split(settingsLinkText);

  return (
    <Html>
      <Head />
      <Body style={styles.main}>
        <Container style={styles.container}>
          <Section style={styles.section}>
            <Text style={styles.heading}>{t('passwordReset.heading')}</Text>
            <Text style={styles.paragraph}>
              {userName
                ? t('emailCommon.greeting', { userName })
                : t('emailCommon.greetingFallback')}
            </Text>
            <Text style={styles.paragraph}>{t('passwordReset.body')}</Text>
            <Button style={styles.button} href={resetUrl}>
              {t('passwordReset.ctaButton')}
            </Button>
            <Text style={styles.smallText}>{t('emailCommon.buttonFallbackText')}</Text>
            <Text style={{ ...styles.smallText, wordBreak: 'break-all' }}>
              <Link style={styles.link} href={resetUrl}>
                {resetUrl}
              </Link>
            </Text>
            <Text style={styles.smallText}>{t('passwordReset.expiryNote')}</Text>
            <Text style={styles.footer}>
              {t('passwordReset.ignoreLine')}
              <br />
              <br />
              {securityBefore}
              <Link style={styles.link} href={`${appUrl}/settings/profile`}>
                {settingsLinkText}
              </Link>
              {securityAfter}
              <br />
              <br />
              {t('emailCommon.teamSignature')}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default PasswordResetEmail;
