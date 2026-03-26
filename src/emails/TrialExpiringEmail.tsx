/**
 * Trial Expiring Email Template
 * トライアル残り3日で送信
 *
 * トリガー: Cron job / scheduled function (trial_end - 3日)
 */

import { Body, Button, Container, Head, Html, Section, Text } from '@react-email/components';

import { createEmailTranslator, type EmailLocale } from './i18n';
import * as styles from './styles';

export interface TrialExpiringEmailProps {
  userName: string;
  trialEndDate: string;
  locale?: EmailLocale;
  appUrl?: string;
}

export function TrialExpiringEmail({
  userName,
  trialEndDate,
  locale = 'en',
  appUrl = 'https://app.dayopt.app',
}: TrialExpiringEmailProps) {
  const t = createEmailTranslator(locale);
  return (
    <Html>
      <Head />
      <Body style={styles.main}>
        <Container style={styles.container}>
          <Section style={styles.section}>
            <Text style={styles.heading}>{t('trialExpiring.heading')}</Text>
            <Text style={styles.paragraph}>
              {userName ? t('common.greeting', { userName }) : t('common.greetingFallback')}
            </Text>
            <Text style={styles.paragraph}>{t('trialExpiring.body', { trialEndDate })}</Text>
            <Text style={styles.paragraph}>{t('trialExpiring.keepProHint')}</Text>
            <Button style={styles.button} href={`${appUrl}/settings/billing`}>
              {t('trialExpiring.ctaButton')}
            </Button>
            <Text style={styles.paragraph}>{t('trialExpiring.freePlanNote')}</Text>
            <Text style={styles.footer}>{t('common.teamSignature')}</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default TrialExpiringEmail;
