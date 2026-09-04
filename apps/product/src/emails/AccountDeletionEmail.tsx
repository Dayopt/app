/**
 * Account Deletion Email Template
 * アカウント削除確認メール (GDPR対応)
 *
 * user.deleteAccount 実行時に送信
 */

import { Body, Container, Head, Html, Link, Section, Text } from 'react-email';

import { dayoptUrls } from '@dayopt/config';

import { createEmailTranslator, type EmailLocale } from './i18n';
import * as styles from './styles';

export interface AccountDeletionEmailProps {
  userName: string;
  deletionDate: string;
  locale?: EmailLocale;
  appUrl?: string;
}

export function AccountDeletionEmail({
  userName,
  deletionDate,
  locale = 'en',
  appUrl = dayoptUrls.product,
}: AccountDeletionEmailProps) {
  const t = createEmailTranslator(locale);
  const supportEmail = t('emailCommon.supportEmail');
  const appLinkText = new URL(dayoptUrls.product).hostname;

  const mistakeLine = t('accountDeletion.mistakeLine', { supportEmail });
  const [mistakeBefore, mistakeAfter] = mistakeLine.split(supportEmail);

  const recreateLine = t('accountDeletion.recreateLine', { appLink: appLinkText });
  const [recreateBefore, recreateAfter] = recreateLine.split(appLinkText);

  return (
    <Html>
      <Head />
      <Body style={styles.main}>
        <Container style={styles.container}>
          <Section style={styles.section}>
            <Text style={styles.heading}>{t('accountDeletion.heading')}</Text>
            <Text style={styles.paragraph}>
              {userName
                ? t('emailCommon.greeting', { userName })
                : t('emailCommon.greetingFallback')}
            </Text>
            <Text style={styles.paragraph}>{t('accountDeletion.body', { deletionDate })}</Text>
            <Text style={styles.paragraph}>{t('accountDeletion.dataRemovedIntro')}</Text>
            <Section style={styles.infoBox}>
              <Text style={{ ...styles.paragraph, margin: '0 0 8px' }}>
                - {t('accountDeletion.dataPlans')}
              </Text>
              <Text style={{ ...styles.paragraph, margin: '0 0 8px' }}>
                - {t('accountDeletion.dataActivities')}
              </Text>
              <Text style={{ ...styles.paragraph, margin: '0' }}>
                - {t('accountDeletion.dataProfile')}
              </Text>
            </Section>
            <Text style={styles.paragraph}>
              {mistakeBefore}
              <Link style={styles.link} href={`mailto:${supportEmail}`}>
                {supportEmail}
              </Link>
              {mistakeAfter}
            </Text>
            <Text style={styles.paragraph}>
              {recreateBefore}
              <Link style={styles.link} href={appUrl}>
                {appLinkText}
              </Link>
              {recreateAfter}
            </Text>
            <Text style={styles.footer}>
              {t('accountDeletion.thankYou')}
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

export default AccountDeletionEmail;
