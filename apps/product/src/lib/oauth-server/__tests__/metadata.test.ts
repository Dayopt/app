import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildAuthorizationServerMetadata, buildProtectedResourceMetadata } from '../metadata';

const READ_SCOPES = ['read:entries', 'read:tags', 'read:constraints', 'read:stats'];

describe('OAuth metadata scopes', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('Production authorization server metadataの公開契約を固定する', () => {
    expect(buildAuthorizationServerMetadata()).toEqual({
      issuer: 'https://app.dayopt.app',
      authorization_endpoint: 'https://app.dayopt.app/oauth/authorize',
      token_endpoint: 'https://app.dayopt.app/oauth/token',
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: READ_SCOPES,
    });
  });

  it('Production protected resource metadataの公開契約を固定する', () => {
    expect(buildProtectedResourceMetadata()).toEqual({
      resource: 'https://mcp.dayopt.app',
      authorization_servers: ['https://app.dayopt.app'],
      bearer_methods_supported: ['header'],
      scopes_supported: READ_SCOPES,
    });
  });

  it('staging metadataは固定staging issuer/resourceだけを広告する', () => {
    vi.stubEnv('MCP_OAUTH_ENVIRONMENT', 'staging');
    vi.stubEnv('OAUTH_AUTHORIZATION_SERVER_URI', 'https://staging.dayopt.app');
    vi.stubEnv('MCP_CANONICAL_RESOURCE_URI', 'https://mcp.staging.dayopt.app');
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('VERCEL_TARGET_ENV', 'staging');

    expect(buildAuthorizationServerMetadata()).toMatchObject({
      issuer: 'https://staging.dayopt.app',
      authorization_endpoint: 'https://staging.dayopt.app/oauth/authorize',
      token_endpoint: 'https://staging.dayopt.app/oauth/token',
    });
    expect(buildProtectedResourceMetadata()).toMatchObject({
      resource: 'https://mcp.staging.dayopt.app',
      authorization_servers: ['https://staging.dayopt.app'],
    });
  });
});
