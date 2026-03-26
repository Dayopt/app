/**
 * Magic Link Email Template
 * マジックリンクログイン時のメール
 *
 * Supabase Auth の magic_link フローで使用
 * NOTE: supabase/functions/send-auth-email/MagicLinkEmail.tsx と同一内容を維持
 */

import { Body, Button, Container, Head, Html, Link, Section, Text } from '@react-email/components';

import { createEmailTranslator, type EmailLocale } from './i18n';
import * as styles from './styles';

export interface MagicLinkEmailProps {
  loginUrl: string;
  locale?: EmailLocale;
  appUrl?: string;
}

export function MagicLinkEmail({
  loginUrl,
  locale = 'en',
  appUrl = 'https://dayopt.app',
}: MagicLinkEmailProps) {
  const t = createEmailTranslator(locale);

  return (
    <Html>
      <Head />
      <Body style={styles.main}>
        <Container style={styles.container}>
          <Section style={styles.section}>
            <Text style={styles.heading}>{t('magicLink.heading')}</Text>
            <Text style={styles.paragraph}>{t('magicLink.body')}</Text>
            <Button style={styles.button} href={loginUrl}>
              {t('magicLink.ctaButton')}
            </Button>
            <Text style={styles.smallText}>{t('common.buttonFallbackText')}</Text>
            <Text style={{ ...styles.smallText, wordBreak: 'break-all' }}>
              <Link style={styles.link} href={loginUrl}>
                {loginUrl}
              </Link>
            </Text>
            <Text style={styles.smallText}>{t('magicLink.expiryNote')}</Text>
            <Text style={styles.footer}>
              {t('magicLink.ignoreLine')}
              <br />
              <br />
              <Link style={styles.link} href={appUrl}>
                dayopt.app
              </Link>
              <br />
              <br />
              {t('common.teamSignature')}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default MagicLinkEmail;
