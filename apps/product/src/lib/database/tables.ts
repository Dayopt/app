export const databaseTables = {
  emailSuppressions: 'email_suppressions',
  externalCalendarEvents: 'external_calendar_events',
  mcpMutationControl: 'mcp_mutation_control',
  mcpMutationReceipts: 'mcp_mutation_receipts',
  records: 'records',
  mfaRecoveryCodes: 'mfa_recovery_codes',
  oauthAuthorizationCodes: 'oauth_authorization_codes',
  oauthConnections: 'oauth_connections',
  oauthTokens: 'oauth_tokens',
  plans: 'plans',
  profiles: 'profiles',
  reports: 'reports',
  stripeWebhookEvents: 'stripe_webhook_events',
  tags: 'tags',
  userSettings: 'user_settings',
} as const;

export type DatabaseTableAlias = keyof typeof databaseTables;
export type DatabaseTableName = (typeof databaseTables)[DatabaseTableAlias];
