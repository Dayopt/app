import type { CanonicalResourceUri, OAuthClientId, SupportedScope } from '@/lib/oauth-server';

export interface McpRequestContext {
  tokenId: string;
  connectionId: string;
  userId: string;
  clientId: OAuthClientId;
  scopes: SupportedScope[];
  resourceUri: CanonicalResourceUri;
}
