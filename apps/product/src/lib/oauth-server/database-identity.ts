import 'server-only';

import type { OAuthEnvironmentConfig } from './identity';

interface DatabaseOAuthIdentity {
  environment: string;
  authorization_server_uri: string;
  resource_uri: string;
  provisioned_at: string;
}

interface DatabaseIdentityQueryResult {
  data: DatabaseOAuthIdentity[] | null;
  error: unknown;
}

type DatabaseIdentityQuery = () => PromiseLike<DatabaseIdentityQueryResult>;

export class DatabaseOAuthIdentityError extends Error {
  constructor(cause?: unknown) {
    super('Database OAuth identity is unavailable', cause === undefined ? undefined : { cause });
    this.name = 'DatabaseOAuthIdentityError';
  }
}

export function matchesDatabaseOAuthIdentity(
  row: DatabaseOAuthIdentity,
  expected: OAuthEnvironmentConfig,
): boolean {
  return (
    row.environment === expected.environment &&
    row.authorization_server_uri === expected.authorizationServerUri &&
    row.resource_uri === expected.resourceUri
  );
}

/**
 * Require the deployment identity and database identity to be the same exact
 * tuple. Errors deliberately omit either tuple so readiness logs cannot expose
 * configuration or credentials.
 */
export async function assertDatabaseOAuthIdentity(
  expected: OAuthEnvironmentConfig,
  query: DatabaseIdentityQuery,
): Promise<void> {
  let result: DatabaseIdentityQueryResult;

  try {
    result = await query();
  } catch (error) {
    throw new DatabaseOAuthIdentityError(error);
  }

  if (
    result.error ||
    result.data?.length !== 1 ||
    !matchesDatabaseOAuthIdentity(result.data[0]!, expected)
  ) {
    throw new DatabaseOAuthIdentityError(result.error ?? undefined);
  }
}
