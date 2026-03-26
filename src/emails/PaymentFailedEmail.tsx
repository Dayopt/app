/**
 * Payment Failed Email Template
 * 支払い失敗時に送信
 *
 * トリガー: invoice.payment_failed webhook
 */

import { Body, Button, Container, Head, Html, Link, Section, Text } from '@react-email/components';

import { createEmailTranslator, type EmailLocale } from './i18n';
import * as styles from './styles';

export interface PaymentFailedEmailProps {
  userName: string;
  /** Stripe Customer Portal URL（動的生成） */
  portalUrl?: string;
  locale?: EmailLocale;
  appUrl?: string;
}

export function PaymentFailedEmail({
  userName,
  portalUrl,
  locale = 'en',
  appUrl = 'https://dayopt.app',
}: PaymentFailedEmailProps) {
  const t = createEmailTranslator(locale);
  const ctaUrl = portalUrl || `${appUrl}/settings/billing`;
  const supportEmail = t('common.supportEmail');
  const helpLine = t('paymentFailed.helpLine', { supportEmail });
  const [helpBefore, helpAfter] = helpLine.split(supportEmail);

  return (
    <Html>
      <Head />
      <Body style={styles.main}>
        <Container style={styles.container}>
          <Section style={styles.section}>
            <Text style={styles.heading}>{t('paymentFailed.heading')}</Text>
            <Text style={styles.paragraph}>
              {userName ? t('common.greeting', { userName }) : t('common.greetingFallback')}
            </Text>
            <Text style={styles.paragraph}>{t('paymentFailed.body')}</Text>
            <Text style={styles.paragraph}>{t('paymentFailed.urgencyNote')}</Text>
            <Button style={styles.button} href={ctaUrl}>
              {t('paymentFailed.ctaButton')}
            </Button>
            <Text style={styles.paragraph}>
              {helpBefore}
              <Link style={styles.link} href={`mailto:${supportEmail}`}>
                {supportEmail}
              </Link>
              {helpAfter}
            </Text>
            <Text style={styles.footer}>{t('common.teamSignature')}</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default PaymentFailedEmail;
