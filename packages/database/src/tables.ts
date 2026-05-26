export const databaseTables = {
  emailSuppressions: 'email_suppressions',
  entries: 'entries',
  mfaRecoveryCodes: 'mfa_recovery_codes',
  oauthAuthorizationCodes: 'oauth_authorization_codes',
  oauthTokens: 'oauth_tokens',
  profiles: 'profiles',
  reports: 'reports',
  stripeWebhookEvents: 'stripe_webhook_events',
  tags: 'tags',
  userSettings: 'user_settings',
} as const;

export type DatabaseTableAlias = keyof typeof databaseTables;
export type DatabaseTableName = (typeof databaseTables)[DatabaseTableAlias];
