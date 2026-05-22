/**
 * Trial Expired Email Template
 * トライアル期限切れ時に送信
 *
 * トリガー: customer.subscription.updated (trialing → canceled/free)
 */

import { Body, Button, Container, Head, Html, Section, Text } from '@react-email/components';

import { dayoptUrls } from '@dayopt/config';

import { createEmailTranslator, type EmailLocale } from './i18n';
import * as styles from './styles';

export interface TrialExpiredEmailProps {
  userName: string;
  locale?: EmailLocale;
  appUrl?: string;
}

export function TrialExpiredEmail({
  userName,
  locale = 'en',
  appUrl = dayoptUrls.product,
}: TrialExpiredEmailProps) {
  const t = createEmailTranslator(locale);
  return (
    <Html>
      <Head />
      <Body style={styles.main}>
        <Container style={styles.container}>
          <Section style={styles.section}>
            <Text style={styles.heading}>{t('trialExpired.heading')}</Text>
            <Text style={styles.paragraph}>
              {userName
                ? t('emailCommon.greeting', { userName })
                : t('emailCommon.greetingFallback')}
            </Text>
            <Text style={styles.paragraph}>{t('trialExpired.body')}</Text>
            <Text style={styles.paragraph}>{t('trialExpired.freeAccessIntro')}</Text>
            <Section style={styles.infoBox}>
              <Text style={{ ...styles.paragraph, margin: '0 0 8px' }}>
                - {t('trialExpired.featureTimeboxing')}
              </Text>
              <Text style={{ ...styles.paragraph, margin: '0 0 8px' }}>
                - {t('trialExpired.featureTracking')}
              </Text>
              <Text style={{ ...styles.paragraph, margin: '0' }}>
                - {t('trialExpired.featureCalendar')}
              </Text>
            </Section>
            <Text style={styles.paragraph}>{t('trialExpired.upgradeHint')}</Text>
            <Button style={styles.button} href={`${appUrl}/settings/billing`}>
              {t('trialExpired.ctaButton')}
            </Button>
            <Text style={styles.footer}>
              {t('trialExpired.thankYou')}
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

export default TrialExpiredEmail;
