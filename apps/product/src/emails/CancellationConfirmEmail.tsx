/**
 * Cancellation Confirm Email Template
 * Pro解約確認時に送信
 *
 * トリガー: customer.subscription.deleted or cancel confirmation
 */

import { Body, Button, Container, Head, Html, Section, Text } from '@react-email/components';

import { dayoptUrls } from '@dayopt/config';

import { createEmailTranslator, type EmailLocale } from './i18n';
import * as styles from './styles';

export interface CancellationConfirmEmailProps {
  userName: string;
  /** Pro アクセス継続期限（billing period end） */
  periodEndDate: string;
  locale?: EmailLocale;
  appUrl?: string;
}

export function CancellationConfirmEmail({
  userName,
  periodEndDate,
  locale = 'en',
  appUrl = dayoptUrls.product,
}: CancellationConfirmEmailProps) {
  const t = createEmailTranslator(locale);
  return (
    <Html>
      <Head />
      <Body style={styles.main}>
        <Container style={styles.container}>
          <Section style={styles.section}>
            <Text style={styles.heading}>{t('cancellationConfirm.heading')}</Text>
            <Text style={styles.paragraph}>
              {userName
                ? t('emailCommon.greeting', { userName })
                : t('emailCommon.greetingFallback')}
            </Text>
            <Text style={styles.paragraph}>{t('cancellationConfirm.body', { periodEndDate })}</Text>
            <Section style={styles.infoBox}>
              <Text style={styles.infoBoxLabel}>
                {t('cancellationConfirm.labelProAccessUntil')}
              </Text>
              <Text style={styles.infoBoxValue}>{periodEndDate}</Text>
            </Section>
            <Text style={styles.paragraph}>{t('cancellationConfirm.afterPeriodNote')}</Text>
            <Text style={styles.paragraph}>{t('cancellationConfirm.resubscribeHint')}</Text>
            <Button style={styles.button} href={`${appUrl}/settings/billing`}>
              {t('cancellationConfirm.ctaButton')}
            </Button>
            <Text style={styles.footer}>
              {t('cancellationConfirm.thankYou')}
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

export default CancellationConfirmEmail;
