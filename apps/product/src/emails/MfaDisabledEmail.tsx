/**
 * MFA Disabled Email Template
 * リカバリーコードによる多要素認証無効化のセキュリティ通知
 *
 * トリガー: RecoveryService.verify() でリカバリーコード検証に成功し、
 * verified MFA factor が削除された後（サーバー側、verify() 応答内で await して送信。
 * serverless環境ではレスポンス返却後にプロセスがkillされうるため、真の
 * fire-and-forgetにはせず送信完了を待つ。失敗しても検証成功自体は取り消さない）
 */

import { Body, Container, Head, Html, Link, Section, Text } from 'react-email';

import { dayoptUrls } from '@dayopt/config';

import { createEmailTranslator, type EmailLocale } from './i18n';
import * as styles from './styles';

export interface MfaDisabledEmailProps {
  userName: string;
  disabledAt: string;
  locale?: EmailLocale;
  appUrl?: string;
}

export function MfaDisabledEmail({
  userName,
  disabledAt,
  locale = 'en',
  appUrl = dayoptUrls.product,
}: MfaDisabledEmailProps) {
  const t = createEmailTranslator(locale);
  const supportEmail = t('emailCommon.supportEmail');
  const resetUrl = `${appUrl}/auth/reset`;
  const securityWarning = t('mfaDisabled.securityWarning', {
    resetLink: resetUrl,
    supportEmail,
  });
  // Split on resetUrl first, then supportEmail
  const [warningBefore, warningAfterReset] = securityWarning.split(resetUrl);
  const [warningMiddle, warningAfterSupport] = warningAfterReset
    ? warningAfterReset.split(supportEmail)
    : ['', ''];

  return (
    <Html>
      <Head />
      <Body style={styles.main}>
        <Container style={styles.container}>
          <Section style={styles.section}>
            <Text style={styles.heading}>{t('mfaDisabled.heading')}</Text>
            <Text style={styles.paragraph}>
              {userName
                ? t('emailCommon.greeting', { userName })
                : t('emailCommon.greetingFallback')}
            </Text>
            <Text style={styles.paragraph}>{t('mfaDisabled.body', { disabledAt })}</Text>
            <Text style={styles.paragraph}>
              {warningBefore}
              <Link style={styles.link} href={resetUrl}>
                {resetUrl}
              </Link>
              {warningMiddle}
              <Link style={styles.link} href={`mailto:${supportEmail}`}>
                {supportEmail}
              </Link>
              {warningAfterSupport}
            </Text>
            <Text style={styles.footer}>{t('emailCommon.teamSignature')}</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default MfaDisabledEmail;
