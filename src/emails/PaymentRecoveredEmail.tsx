/**
 * Payment Recovered Email Template
 * 支払いリトライ成功時に送信
 *
 * トリガー: customer.subscription.updated (past_due → active)
 */

import { Body, Button, Container, Head, Html, Section, Text } from '@react-email/components';

import { createEmailTranslator, type EmailLocale } from './i18n';
import * as styles from './styles';

export interface PaymentRecoveredEmailProps {
  userName: string;
  locale?: EmailLocale;
  appUrl?: string;
}

export function PaymentRecoveredEmail({
  userName,
  locale = 'en',
  appUrl = 'https://dayopt.app',
}: PaymentRecoveredEmailProps) {
  const t = createEmailTranslator(locale);
  return (
    <Html>
      <Head />
      <Body style={styles.main}>
        <Container style={styles.container}>
          <Section style={styles.section}>
            <Text style={styles.heading}>{t('paymentRecovered.heading')}</Text>
            <Text style={styles.paragraph}>
              {userName ? t('common.greeting', { userName }) : t('common.greetingFallback')}
            </Text>
            <Text style={styles.paragraph}>{t('paymentRecovered.body')}</Text>
            <Text style={styles.paragraph}>{t('paymentRecovered.noActionNote')}</Text>
            <Button style={styles.button} href={`${appUrl}/calendar`}>
              {t('paymentRecovered.ctaButton')}
            </Button>
            <Text style={styles.footer}>{t('common.teamSignature')}</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default PaymentRecoveredEmail;
