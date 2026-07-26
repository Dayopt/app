import { describe, expect, it } from 'vitest';

import { isOAuthRequestHostAllowed, resolveOAuthEnvironmentConfig } from '../identity';

describe('MCP OAuth environment identity', () => {
  it('keeps the established Production identity as the local/default contract', () => {
    expect(resolveOAuthEnvironmentConfig({})).toEqual({
      environment: 'production',
      surfacesEnabled: true,
      authorizationServerUri: 'https://app.dayopt.app',
      authorizationServerHost: 'app.dayopt.app',
      authorizationEndpoint: 'https://app.dayopt.app/oauth/authorize',
      tokenEndpoint: 'https://app.dayopt.app/oauth/token',
      resourceUri: 'https://mcp.dayopt.app',
      resourceHost: 'mcp.dayopt.app',
      protectedResourceMetadataUri: 'https://mcp.dayopt.app/.well-known/oauth-protected-resource',
    });
  });

  it('accepts only the fixed staging identity in the Vercel Custom Environment', () => {
    expect(
      resolveOAuthEnvironmentConfig({
        mcpOAuthEnvironment: 'staging',
        authorizationServerUri: 'HTTPS://STAGING.DAYOPT.APP:443/',
        resourceUri: 'https://MCP.STAGING.DAYOPT.APP/',
        vercelEnvironment: 'preview',
        vercelTargetEnvironment: 'staging',
      }),
    ).toEqual({
      environment: 'staging',
      surfacesEnabled: true,
      authorizationServerUri: 'https://staging.dayopt.app',
      authorizationServerHost: 'staging.dayopt.app',
      authorizationEndpoint: 'https://staging.dayopt.app/oauth/authorize',
      tokenEndpoint: 'https://staging.dayopt.app/oauth/token',
      resourceUri: 'https://mcp.staging.dayopt.app',
      resourceHost: 'mcp.staging.dayopt.app',
      protectedResourceMetadataUri:
        'https://mcp.staging.dayopt.app/.well-known/oauth-protected-resource',
    });
  });

  it.each([
    {
      name: 'missing staging issuer',
      input: {
        mcpOAuthEnvironment: 'staging',
        resourceUri: 'https://mcp.staging.dayopt.app',
      },
    },
    {
      name: 'Production resource in staging',
      input: {
        mcpOAuthEnvironment: 'staging',
        authorizationServerUri: 'https://staging.dayopt.app',
        resourceUri: 'https://mcp.dayopt.app',
      },
    },
    {
      name: 'transport path in issuer',
      input: {
        authorizationServerUri: 'https://app.dayopt.app/oauth',
        resourceUri: 'https://mcp.dayopt.app',
      },
    },
    {
      name: 'staging target without staging marker',
      input: {
        vercelEnvironment: 'preview',
        vercelTargetEnvironment: 'staging',
      },
    },
    {
      name: 'staging marker on a generic Preview',
      input: {
        mcpOAuthEnvironment: 'staging',
        authorizationServerUri: 'https://staging.dayopt.app',
        resourceUri: 'https://mcp.staging.dayopt.app',
        vercelEnvironment: 'preview',
      },
    },
    {
      name: 'staging target as a Production deployment',
      input: {
        mcpOAuthEnvironment: 'staging',
        authorizationServerUri: 'https://staging.dayopt.app',
        resourceUri: 'https://mcp.staging.dayopt.app',
        vercelEnvironment: 'production',
        vercelTargetEnvironment: 'staging',
      },
    },
  ])('rejects identity drift: $name', ({ input }) => {
    expect(() => resolveOAuthEnvironmentConfig(input)).toThrow();
  });

  it('keeps the identity unavailable on a generic Vercel Preview', () => {
    expect(
      resolveOAuthEnvironmentConfig({
        vercelEnvironment: 'preview',
        vercelTargetEnvironment: 'preview',
      }).surfacesEnabled,
    ).toBe(false);
  });
});

describe('MCP OAuth host boundary', () => {
  const productionIdentity = resolveOAuthEnvironmentConfig({});
  const stagingIdentity = resolveOAuthEnvironmentConfig({
    mcpOAuthEnvironment: 'staging',
    authorizationServerUri: 'https://staging.dayopt.app',
    resourceUri: 'https://mcp.staging.dayopt.app',
  });

  it.each([
    ['mcp.dayopt.app', '/'],
    ['mcp.dayopt.app', '/mcp'],
    ['mcp.dayopt.app', '/api/mcp'],
    ['mcp.dayopt.app', '/.well-known/oauth-protected-resource'],
    ['app.dayopt.app', '/oauth/authorize'],
    ['app.dayopt.app', '/oauth/consent'],
    ['app.dayopt.app', '/oauth/token'],
    ['app.dayopt.app', '/api/oauth/token'],
    ['app.dayopt.app', '/.well-known/oauth-authorization-server'],
    ['app.dayopt.app', '/week'],
  ])('allows the exact Production host/path pair: %s%s', (hostname, pathname) => {
    expect(
      isOAuthRequestHostAllowed({
        identity: productionIdentity,
        hostname,
        pathname,
        allowLocalDevelopment: false,
      }),
    ).toBe(true);
  });

  it.each([
    ['app.dayopt.app', '/api/mcp'],
    ['app.dayopt.app', '/api/mcp/'],
    ['mcp.dayopt.app', '/api/oauth/token'],
    ['mcp.dayopt.app', '/week'],
    ['preview-product.vercel.app', '/api/mcp'],
    ['preview-product.vercel.app', '/oauth/authorize'],
    ['mcp.dayopt.app.example.com', '/mcp'],
    ['staging.dayopt.app', '/oauth/authorize'],
    ['staging.dayopt.app', '/week'],
    ['mcp.staging.dayopt.app', '/mcp'],
    ['mcp.staging.dayopt.app', '/week'],
  ])('rejects a cross-environment or foreign host/path pair: %s%s', (hostname, pathname) => {
    expect(
      isOAuthRequestHostAllowed({
        identity: productionIdentity,
        hostname,
        pathname,
        allowLocalDevelopment: false,
      }),
    ).toBe(false);
  });

  it('allows only the fixed staging hosts for the staging identity', () => {
    expect(
      isOAuthRequestHostAllowed({
        identity: stagingIdentity,
        hostname: 'staging.dayopt.app',
        pathname: '/oauth/token',
        allowLocalDevelopment: false,
      }),
    ).toBe(true);
    expect(
      isOAuthRequestHostAllowed({
        identity: stagingIdentity,
        hostname: 'mcp.staging.dayopt.app',
        pathname: '/api/mcp',
        allowLocalDevelopment: false,
      }),
    ).toBe(true);
    expect(
      isOAuthRequestHostAllowed({
        identity: stagingIdentity,
        hostname: 'app.dayopt.app',
        pathname: '/oauth/token',
        allowLocalDevelopment: false,
      }),
    ).toBe(false);
    expect(
      isOAuthRequestHostAllowed({
        identity: stagingIdentity,
        hostname: 'app.dayopt.app',
        pathname: '/week',
        allowLocalDevelopment: false,
      }),
    ).toBe(false);
  });

  it('normalizes a trailing slash before applying the host boundary', () => {
    expect(
      isOAuthRequestHostAllowed({
        identity: productionIdentity,
        hostname: 'mcp.dayopt.app',
        pathname: '/api/mcp/',
        allowLocalDevelopment: false,
      }),
    ).toBe(true);
    expect(
      isOAuthRequestHostAllowed({
        identity: productionIdentity,
        hostname: 'preview-product.vercel.app',
        pathname: '/api/oauth/token/',
        allowLocalDevelopment: false,
      }),
    ).toBe(false);
  });

  it('rejects all fixed OAuth hosts when a generic Preview is served on them', () => {
    const previewIdentity = resolveOAuthEnvironmentConfig({
      vercelEnvironment: 'preview',
      vercelTargetEnvironment: 'preview',
    });

    for (const [hostname, pathname] of [
      ['app.dayopt.app', '/oauth/authorize'],
      ['app.dayopt.app', '/week'],
      ['mcp.dayopt.app', '/'],
    ] as const) {
      expect(
        isOAuthRequestHostAllowed({
          identity: previewIdentity,
          hostname,
          pathname,
          allowLocalDevelopment: false,
        }),
      ).toBe(false);
    }
  });

  it('keeps local development available without allowing arbitrary Preview hosts', () => {
    expect(
      isOAuthRequestHostAllowed({
        identity: productionIdentity,
        hostname: 'localhost',
        pathname: '/api/mcp',
        allowLocalDevelopment: true,
      }),
    ).toBe(true);
    expect(
      isOAuthRequestHostAllowed({
        identity: productionIdentity,
        hostname: 'preview-product.vercel.app',
        pathname: '/api/mcp',
        allowLocalDevelopment: true,
      }),
    ).toBe(false);
  });
});
