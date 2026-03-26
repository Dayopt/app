/**
 * Plan Reminder Email Template
 * プランリマインダー通知メール
 *
 * notification_preferences.enable_email_notifications が有効な場合に送信
 */

import { Body, Button, Container, Head, Html, Link, Section, Text } from '@react-email/components';

import { createEmailTranslator, type EmailLocale } from './i18n';
import * as styles from './styles';

export interface ReminderEmailProps {
  userName: string;
  planTitle: string;
  startTime: string;
  locale?: EmailLocale;
  appUrl?: string;
}

export function ReminderEmail({
  userName,
  planTitle,
  startTime,
  locale = 'en',
  appUrl = 'https://dayopt.app',
}: ReminderEmailProps) {
  const t = createEmailTranslator(locale);
  const manageLinkText = t('common.manageNotificationSettings');
  const notificationOptOut = t('common.notificationOptOut', { manageLink: manageLinkText });
  const [notifBefore, notifAfter] = notificationOptOut.split(manageLinkText);

  return (
    <Html>
      <Head />
      <Body style={styles.main}>
        <Container style={styles.container}>
          <Section style={styles.section}>
            <Text style={styles.heading}>{t('reminder.heading')}</Text>
            <Text style={styles.paragraph}>
              {userName ? t('common.greeting', { userName }) : t('common.greetingFallback')}
            </Text>
            <Text style={styles.paragraph}>{t('reminder.body')}</Text>
            <Section style={styles.infoBox}>
              <Text style={styles.infoBoxLabel}>{t('reminder.labelPlan')}</Text>
              <Text style={styles.infoBoxValue}>{planTitle}</Text>
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
              {t('common.teamSignature')}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default ReminderEmail;
