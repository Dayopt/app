/**
 * Password Changed Email Template
 * パスワード変更完了時のセキュリティ通知
 *
 * トリガー: Settings → パスワード変更成功後
 */

import { Body, Container, Head, Html, Link, Section, Text } from '@react-email/components';

import { createEmailTranslator, type EmailLocale } from './i18n';
import * as styles from './styles';

export interface PasswordChangedEmailProps {
  userName: string;
  locale?: EmailLocale;
  appUrl?: string;
}

export function PasswordChangedEmail({
  userName,
  locale = 'en',
  appUrl = 'https://app.dayopt.app',
}: PasswordChangedEmailProps) {
  const t = createEmailTranslator(locale);
  const supportEmail = t('common.supportEmail');
  const resetUrl = `${appUrl}/auth/reset`;
  const securityWarning = t('passwordChanged.securityWarning', {
    resetLink: resetUrl,
    supportEmail,
  });
  // Split on resetUrl first, then supportEmail
  const [warningBefore, warningAfterReset] = securityWarning.split(resetUrl);
  const [warningMiddle, warningAfterSupport] = warningAfterReset
    ? warningAfterReset.split(supportEmail)
    : ['', ''];

  return (
    <Html>
      <Head />
      <Body style={styles.main}>
        <Container style={styles.container}>
          <Section style={styles.section}>
            <Text style={styles.heading}>{t('passwordChanged.heading')}</Text>
            <Text style={styles.paragraph}>
              {userName ? t('common.greeting', { userName }) : t('common.greetingFallback')}
            </Text>
            <Text style={styles.paragraph}>{t('passwordChanged.body')}</Text>
            <Text style={styles.paragraph}>
              {warningBefore}
              <Link style={styles.link} href={resetUrl}>
                {resetUrl}
              </Link>
              {warningMiddle}
              <Link style={styles.link} href={`mailto:${supportEmail}`}>
                {supportEmail}
              </Link>
              {warningAfterSupport}
            </Text>
            <Text style={styles.footer}>{t('common.teamSignature')}</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default PasswordChangedEmail;
