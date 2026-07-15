/**
 * Email Confirmation Template
 * 新規登録時のメールアドレス確認メール
 *
 * Supabase Auth の signup フローで使用
 * NOTE: supabase/functions/send-auth-email/ConfirmEmail.tsx と同一内容を維持
 */

import { Body, Button, Container, Head, Html, Link, Section, Text } from 'react-email';

import { dayoptUrls } from '@dayopt/config';

import { createEmailTranslator, type EmailLocale } from './i18n';
import * as styles from './styles';

export interface ConfirmEmailProps {
  userName: string;
  confirmUrl: string;
  locale?: EmailLocale;
  appUrl?: string;
}

export function ConfirmEmail({
  userName,
  confirmUrl,
  locale = 'en',
  appUrl = dayoptUrls.product,
}: ConfirmEmailProps) {
  const t = createEmailTranslator(locale);
  const ignoreLine = t('confirm.ignoreLine');
  const appName = 'Dayopt';
  const [ignoreLineBefore, ignoreLineAfter] = ignoreLine.includes(appName)
    ? [ignoreLine.split(appName)[0], ignoreLine.split(appName).slice(1).join(appName)]
    : [ignoreLine, ''];

  return (
    <Html>
      <Head />
      <Body style={styles.main}>
        <Container style={styles.container}>
          <Section style={styles.section}>
            <Text style={styles.heading}>{t('confirm.heading')}</Text>
            <Text style={styles.paragraph}>
              {userName
                ? t('emailCommon.greeting', { userName })
                : t('emailCommon.greetingFallback')}
            </Text>
            <Text style={styles.paragraph}>{t('confirm.body')}</Text>
            <Button style={styles.button} href={confirmUrl}>
              {t('confirm.ctaButton')}
            </Button>
            <Text style={styles.smallText}>{t('emailCommon.buttonFallbackText')}</Text>
            <Text style={{ ...styles.smallText, wordBreak: 'break-all' }}>
              <Link style={styles.link} href={confirmUrl}>
                {confirmUrl}
              </Link>
            </Text>
            <Text style={styles.footer}>
              {ignoreLineBefore}
              <Link style={styles.link} href={appUrl}>
                {appName}
              </Link>
              {ignoreLineAfter}
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

export default ConfirmEmail;
