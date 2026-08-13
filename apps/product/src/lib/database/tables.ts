export const databaseTables = {
  calendarConnections: 'calendar_connections',
  calendarConnectionCalendars: 'calendar_connection_calendars',
  emailSuppressions: 'email_suppressions',
  externalCalendarEvents: 'external_calendar_events',
  mcpMutationControl: 'mcp_mutation_control',
  records: 'records',
  mfaRecoveryCodes: 'mfa_recovery_codes',
  oauthAuthorizationCodes: 'oauth_authorization_codes',
  oauthConnections: 'oauth_connections',
  oauthTokens: 'oauth_tokens',
  plans: 'plans',
  productEvents: 'product_events',
  profiles: 'profiles',
  reports: 'reports',
  stripeWebhookEvents: 'stripe_webhook_events',
  tags: 'tags',
  userSettings: 'user_settings',
  writeFenceControl: 'write_fence_control',
} as const;

export type DatabaseTableAlias = keyof typeof databaseTables;
export type DatabaseTableName = (typeof databaseTables)[DatabaseTableAlias];
