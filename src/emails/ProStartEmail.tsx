/**
 * Pro Start Email Template
 * Proサブスクリプション開始時に送信
 *
 * トリガー: checkout.session.completed (status=active) or
 *          customer.subscription.updated (trialing → active)
 */

import { Body, Button, Container, Head, Html, Section, Text } from '@react-email/components';

import * as styles from './styles';

export interface ProStartEmailProps {
  userName: string;
  appUrl?: string;
}

export function ProStartEmail({ userName, appUrl = 'https://dayopt.app' }: ProStartEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={styles.main}>
        <Container style={styles.container}>
          <Section style={styles.section}>
            <Text style={styles.heading}>Welcome to Pro</Text>
            <Text style={styles.paragraph}>Hi {userName || 'there'},</Text>
            <Text style={styles.paragraph}>
              Your Pro subscription is now active. Thank you for your support.
            </Text>
            <Text style={styles.paragraph}>You now have full access to:</Text>
            <Section style={styles.infoBox}>
              <Text style={{ ...styles.paragraph, margin: '0 0 8px' }}>
                - Detailed analytics and insights
              </Text>
              <Text style={{ ...styles.paragraph, margin: '0 0 8px' }}>
                - Unlimited tags and categories
              </Text>
              <Text style={{ ...styles.paragraph, margin: '0 0 8px' }}>
                - API access and data export
              </Text>
              <Text style={{ ...styles.paragraph, margin: '0' }}>- Unlimited AI assistance</Text>
            </Section>
            <Text style={styles.paragraph}>
              Manage your subscription anytime in Settings → Billing.
            </Text>
            <Button style={styles.button} href={`${appUrl}/calendar`}>
              Open Dayopt
            </Button>
            <Text style={styles.footer}>The Dayopt Team</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default ProStartEmail;
