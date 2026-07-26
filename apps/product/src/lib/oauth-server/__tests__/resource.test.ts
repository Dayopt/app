import { afterEach, describe, expect, it, vi } from 'vitest';

import { normalizeResourceUri, resolveRequestedResource } from '../resource';

describe('OAuth MCP resource normalization', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    'https://mcp.dayopt.app',
    'https://MCP.DAYOPT.APP',
    'HTTPS://mcp.dayopt.app',
    'https://mcp.dayopt.app/',
    'https://mcp.dayopt.app:443',
    'HTTPS://MCP.DAYOPT.APP:443/',
  ])('accepts an equivalent canonical origin: %s', (value) => {
    expect(resolveRequestedResource(value)).toBe('https://mcp.dayopt.app');
  });

  it.each([
    'http://mcp.dayopt.app',
    'https://user@mcp.dayopt.app',
    'https://mcp.dayopt.app:444',
    'https://mcp.dayopt.app/mcp',
    'https://mcp.dayopt.app/api/mcp',
    'https://mcp.dayopt.app?resource=other',
    'https://mcp.dayopt.app?',
    'https://mcp.dayopt.app#fragment',
    'https://mcp.dayopt.app#',
    'https://@mcp.dayopt.app',
    'https://user:@mcp.dayopt.app',
    'https://:@mcp.dayopt.app',
    'https:mcp.dayopt.app',
    'https:///mcp.dayopt.app',
    'https:/@mcp.dayopt.app',
    'https:\\@mcp.dayopt.app',
    'https://mcp.dayopt.app/mcp/..',
    'https://mcp.dayopt.app/%2e',
    'https://%6dcp.dayopt.app',
    'https://mcp.dayopt.app:0443',
    'https://mcp.day\topt.app',
    'https://mcp.dayopt.app\n',
    'https://mcp.dayopt.app\r',
    'https://other.dayopt.app',
    ' https://mcp.dayopt.app',
    'https://mcp.dayopt.app ',
    'not-a-url',
  ])('rejects a different or unsafe resource identity: %s', (value) => {
    expect(resolveRequestedResource(value)).toBeNull();
  });

  it('does not accept a missing resource', () => {
    expect(resolveRequestedResource(undefined)).toBeNull();
  });

  it('normalizes only the URL identity, not a transport path', () => {
    expect(normalizeResourceUri('https://mcp.dayopt.app/')).toBe('https://mcp.dayopt.app');
    expect(normalizeResourceUri('https://mcp.dayopt.app/mcp')).toBeNull();
  });

  it('staging deployment accepts only the staging resource', () => {
    vi.stubEnv('MCP_OAUTH_ENVIRONMENT', 'staging');
    vi.stubEnv('OAUTH_AUTHORIZATION_SERVER_URI', 'https://staging.dayopt.app');
    vi.stubEnv('MCP_CANONICAL_RESOURCE_URI', 'https://mcp.staging.dayopt.app');
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('VERCEL_TARGET_ENV', 'staging');

    expect(resolveRequestedResource('https://MCP.STAGING.DAYOPT.APP:443/')).toBe(
      'https://mcp.staging.dayopt.app',
    );
    expect(resolveRequestedResource('https://mcp.dayopt.app')).toBeNull();
  });
});
