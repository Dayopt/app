/**
 * Plan Reminder Email Template
 * プランリマインダー通知メール
 */

import { Body, Button, Container, Head, Html, Link, Section, Text } from '@react-email/components';

import { createEmailTranslator, type EmailLocale } from './i18n';
import * as styles from './styles';

export interface ReminderEmailProps {
  userName: string;
  entryTitle: string;
  startTime: string;
  locale?: EmailLocale;
  appUrl?: string;
}

export function ReminderEmail({
  userName,
  entryTitle,
  startTime,
  locale = 'en',
  appUrl = 'https://app.dayopt.app',
}: ReminderEmailProps) {
  const t = createEmailTranslator(locale);
  const manageLinkText = t('emailCommon.manageNotificationSettings');
  const notificationOptOut = t('emailCommon.notificationOptOut', { manageLink: manageLinkText });
  const [notifBefore, notifAfter] = notificationOptOut.split(manageLinkText);

  return (
    <Html>
      <Head />
      <Body style={styles.main}>
        <Container style={styles.container}>
          <Section style={styles.section}>
            <Text style={styles.heading}>{t('reminder.heading')}</Text>
            <Text style={styles.paragraph}>
              {userName
                ? t('emailCommon.greeting', { userName })
                : t('emailCommon.greetingFallback')}
            </Text>
            <Text style={styles.paragraph}>{t('reminder.body')}</Text>
            <Section style={styles.infoBox}>
              <Text style={styles.infoBoxLabel}>{t('reminder.labelPlan')}</Text>
              <Text style={styles.infoBoxValue}>{entryTitle}</Text>
              <Text style={{ ...styles.infoBoxLabel, marginTop: '12px' }}>
                {t('reminder.labelStartsAt')}
              </Text>
              <Text style={styles.infoBoxValue}>{startTime}</Text>
            </Section>
            <Button style={styles.button} href={`${appUrl}/calendar`}>
              {t('reminder.ctaButton')}
            </Button>
            <Text style={styles.footer}>
              {notifBefore}
              <Link style={styles.link} href={`${appUrl}/settings/notifications`}>
                {manageLinkText}
              </Link>
              {notifAfter}
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

export default ReminderEmail;
