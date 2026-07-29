import 'server-only';

import { env } from '@/env';

import { resolveOAuthEnvironmentConfig, type OAuthEnvironmentConfig } from './identity';

export function getOAuthEnvironmentConfig(): OAuthEnvironmentConfig {
  return resolveOAuthEnvironmentConfig({
    mcpOAuthEnvironment: env.MCP_OAUTH_ENVIRONMENT,
    authorizationServerUri: env.OAUTH_AUTHORIZATION_SERVER_URI,
    resourceUri: env.MCP_CANONICAL_RESOURCE_URI,
    vercelEnvironment: env.VERCEL_ENV,
    vercelTargetEnvironment: env.VERCEL_TARGET_ENV,
    vercelBranchUrl: env.VERCEL_BRANCH_URL,
    vercelGitCommitRef: env.VERCEL_GIT_COMMIT_REF,
    mcpOAuthPreviewBranch: env.MCP_OAUTH_PREVIEW_BRANCH,
  });
}
