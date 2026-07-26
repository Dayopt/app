import { describe, expect, it } from 'vitest';

import {
  assertDatabaseOAuthIdentity,
  DatabaseOAuthIdentityError,
  matchesDatabaseOAuthIdentity,
} from '../database-identity';
import { resolveOAuthEnvironmentConfig } from '../identity';

const productionIdentity = resolveOAuthEnvironmentConfig({});
const databaseProductionIdentity = {
  environment: 'production',
  authorization_server_uri: 'https://app.dayopt.app',
  resource_uri: 'https://mcp.dayopt.app',
  provisioned_at: '2026-07-26T00:00:00.000Z',
};

describe('database OAuth identity', () => {
  it('accepts the one exact deployment/database tuple', async () => {
    expect(matchesDatabaseOAuthIdentity(databaseProductionIdentity, productionIdentity)).toBe(true);

    await expect(
      assertDatabaseOAuthIdentity(productionIdentity, async () => ({
        data: [databaseProductionIdentity],
        error: null,
      })),
    ).resolves.toBeUndefined();
  });

  it.each([
    {
      name: 'missing row',
      data: [],
    },
    {
      name: 'duplicate rows',
      data: [databaseProductionIdentity, databaseProductionIdentity],
    },
    {
      name: 'environment mismatch',
      data: [{ ...databaseProductionIdentity, environment: 'staging' }],
    },
    {
      name: 'authorization server mismatch',
      data: [
        {
          ...databaseProductionIdentity,
          authorization_server_uri: 'https://staging.dayopt.app',
        },
      ],
    },
    {
      name: 'resource mismatch',
      data: [
        {
          ...databaseProductionIdentity,
          resource_uri: 'https://mcp.staging.dayopt.app',
        },
      ],
    },
  ])('rejects a $name without returning either tuple', async ({ data }) => {
    await expect(
      assertDatabaseOAuthIdentity(productionIdentity, async () => ({
        data,
        error: null,
      })),
    ).rejects.toEqual(
      expect.objectContaining<Partial<DatabaseOAuthIdentityError>>({
        name: 'DatabaseOAuthIdentityError',
        message: 'Database OAuth identity is unavailable',
      }),
    );
  });

  it('preserves a query failure as the generic identity error cause', async () => {
    const queryError = new Error('database-message-sentinel');

    await expect(
      assertDatabaseOAuthIdentity(productionIdentity, async () => {
        throw queryError;
      }),
    ).rejects.toMatchObject({
      name: 'DatabaseOAuthIdentityError',
      cause: queryError,
    });
  });
});
