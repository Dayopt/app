import { createDayoptUrl, dayoptStagingUrls, dayoptUrls } from '@dayopt/config';

import {
  normalizeHttpsOrigin,
  type CanonicalAuthorizationServerUri,
  type CanonicalResourceUri,
} from './origin';

export type McpOAuthEnvironment = 'production' | 'staging';

export interface OAuthEnvironmentConfig {
  environment: McpOAuthEnvironment;
  surfacesEnabled: boolean;
  authorizationServerUri: CanonicalAuthorizationServerUri;
  authorizationServerHost: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  resourceUri: CanonicalResourceUri;
  resourceHost: string;
  protectedResourceMetadataUri: string;
}

interface OAuthEnvironmentInput {
  mcpOAuthEnvironment?: string | undefined;
  authorizationServerUri?: string | undefined;
  resourceUri?: string | undefined;
  vercelEnvironment?: string | undefined;
  vercelTargetEnvironment?: string | undefined;
}

const AUTHORIZATION_SERVER_PATHS = new Set([
  '/oauth/authorize',
  '/oauth/consent',
  '/oauth/token',
  '/api/oauth/token',
  '/.well-known/oauth-authorization-server',
]);

const PROTECTED_RESOURCE_PATHS = new Set([
  '/mcp',
  '/api/mcp',
  '/.well-known/oauth-protected-resource',
]);

const KNOWN_RESOURCE_HOSTS = new Set([
  new URL(dayoptUrls.mcp).hostname,
  new URL(dayoptStagingUrls.mcp).hostname,
]);

const KNOWN_AUTHORIZATION_SERVER_HOSTS = new Set([
  new URL(dayoptUrls.product).hostname,
  new URL(dayoptStagingUrls.product).hostname,
]);

const EXPECTED_IDENTITIES = {
  production: {
    authorizationServerUri: dayoptUrls.product,
    resourceUri: dayoptUrls.mcp,
  },
  staging: {
    authorizationServerUri: dayoptStagingUrls.product,
    resourceUri: dayoptStagingUrls.mcp,
  },
} as const;

/**
 * Resolve the one OAuth identity owned by this deployment.
 *
 * Production keeps the established origin defaults. Staging has no fallback:
 * marker, issuer, resource, and Vercel Custom Environment must agree.
 */
export function resolveOAuthEnvironmentConfig(
  input: OAuthEnvironmentInput,
): OAuthEnvironmentConfig {
  const environment = resolveEnvironment(input.mcpOAuthEnvironment);
  const expected = EXPECTED_IDENTITIES[environment];
  const authorizationServerUri = normalizeAuthorizationServerUri(
    input.authorizationServerUri ??
      (environment === 'production' ? expected.authorizationServerUri : ''),
  );
  const resourceUri = normalizeResourceUri(
    input.resourceUri ?? (environment === 'production' ? expected.resourceUri : ''),
  );

  if (authorizationServerUri !== expected.authorizationServerUri) {
    throw new Error(`OAUTH_AUTHORIZATION_SERVER_URI must match the ${environment} OAuth identity`);
  }
  if (resourceUri !== expected.resourceUri) {
    throw new Error(`MCP_CANONICAL_RESOURCE_URI must match the ${environment} OAuth identity`);
  }

  assertVercelEnvironmentBinding(input, environment);

  return {
    environment,
    surfacesEnabled: isOAuthSurfaceEnabled(input, environment),
    authorizationServerUri,
    authorizationServerHost: new URL(authorizationServerUri).hostname,
    authorizationEndpoint: createDayoptUrl(authorizationServerUri, '/oauth/authorize'),
    tokenEndpoint: createDayoptUrl(authorizationServerUri, '/oauth/token'),
    resourceUri,
    resourceHost: new URL(resourceUri).hostname,
    protectedResourceMetadataUri: createDayoptUrl(
      resourceUri,
      '/.well-known/oauth-protected-resource',
    ),
  };
}

export function isOAuthSurfacePath(pathname: string): boolean {
  const normalizedPathname = normalizeOAuthSurfacePath(pathname);
  return (
    AUTHORIZATION_SERVER_PATHS.has(normalizedPathname) ||
    PROTECTED_RESOURCE_PATHS.has(normalizedPathname)
  );
}

export function isOAuthRequestHostAllowed(input: {
  identity: OAuthEnvironmentConfig;
  hostname: string;
  pathname: string;
  allowLocalDevelopment: boolean;
}): boolean {
  const { hostname, identity } = input;
  const pathname = normalizeOAuthSurfacePath(input.pathname);
  if (input.allowLocalDevelopment && isLocalHostname(hostname)) return true;

  if (
    !identity.surfacesEnabled &&
    (KNOWN_AUTHORIZATION_SERVER_HOSTS.has(hostname) ||
      KNOWN_RESOURCE_HOSTS.has(hostname) ||
      isOAuthSurfacePath(pathname))
  ) {
    return false;
  }

  if (KNOWN_RESOURCE_HOSTS.has(hostname) && hostname !== identity.resourceHost) return false;
  if (hostname === identity.resourceHost) {
    return pathname === '/' || PROTECTED_RESOURCE_PATHS.has(pathname);
  }
  if (
    KNOWN_AUTHORIZATION_SERVER_HOSTS.has(hostname) &&
    hostname !== identity.authorizationServerHost
  ) {
    return false;
  }
  if (PROTECTED_RESOURCE_PATHS.has(pathname)) return false;
  if (AUTHORIZATION_SERVER_PATHS.has(pathname)) {
    return hostname === identity.authorizationServerHost;
  }

  return true;
}

function resolveEnvironment(value: string | undefined): McpOAuthEnvironment {
  if (value === undefined || value === '' || value === 'production') return 'production';
  if (value === 'staging') return 'staging';
  throw new Error('MCP_OAUTH_ENVIRONMENT must be production or staging');
}

function isLocalHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

function normalizeOAuthSurfacePath(pathname: string): string {
  if (pathname === '/') return pathname;
  return pathname.replace(/\/+$/u, '');
}

function normalizeAuthorizationServerUri(value: string): CanonicalAuthorizationServerUri | null {
  return normalizeHttpsOrigin(value) as CanonicalAuthorizationServerUri | null;
}

function normalizeResourceUri(value: string): CanonicalResourceUri | null {
  return normalizeHttpsOrigin(value) as CanonicalResourceUri | null;
}

function assertVercelEnvironmentBinding(
  input: OAuthEnvironmentInput,
  environment: McpOAuthEnvironment,
): void {
  const isVercelDeployment = Boolean(input.vercelEnvironment);
  const targetsStaging = input.vercelTargetEnvironment === 'staging';

  if (targetsStaging && environment !== 'staging') {
    throw new Error('VERCEL_TARGET_ENV=staging requires MCP_OAUTH_ENVIRONMENT=staging');
  }
  if (environment === 'staging' && isVercelDeployment && !targetsStaging) {
    throw new Error('MCP staging identity requires VERCEL_TARGET_ENV=staging');
  }
  if (targetsStaging && input.vercelEnvironment !== 'preview') {
    throw new Error('The Vercel staging Custom Environment must use VERCEL_ENV=preview');
  }
  if (input.vercelEnvironment === 'production' && environment !== 'production') {
    throw new Error('A Vercel Production deployment must use the production OAuth identity');
  }
}

function isOAuthSurfaceEnabled(
  input: OAuthEnvironmentInput,
  environment: McpOAuthEnvironment,
): boolean {
  if (!input.vercelEnvironment) return true;
  if (environment === 'staging') {
    return input.vercelEnvironment === 'preview' && input.vercelTargetEnvironment === 'staging';
  }
  return input.vercelEnvironment === 'production';
}
