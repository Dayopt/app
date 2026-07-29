import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '@/lib/database';

const LOCAL_DB_URL = 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const RUN_LOCAL = process.env.USE_LOCAL_DB === 'true';
const productionResource = 'https://mcp.dayopt.app';

const admin = createClient<Database>(LOCAL_DB_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const userId = crypto.randomUUID();
const connectionId = crypto.randomUUID();
const tokenId = crypto.randomUUID();
const codeHash = `candidate-4-code-${crypto.randomUUID()}`;
const email = `mcp-candidate-4-${userId}@example.com`;
const password = 'test-password-123';

const candidateMigration = readFileSync(
  new URL(
    '../../../../../../supabase/migrations/20260730090100_mcp_oauth_scope_constraints_not_valid.sql',
    import.meta.url,
  ),
  'utf8',
);

const stagedConstraintNames = [
  'oauth_connections_write_requires_read_entries_check',
  'oauth_authorization_codes_write_requires_read_entries_check',
  'oauth_tokens_write_requires_read_entries_check',
] as const;

const existingResourceConstraintNames = [
  'oauth_connections_environment_resource_fkey',
  'oauth_authorization_codes_environment_resource_fkey',
  'oauth_tokens_environment_resource_fkey',
] as const;

function runOwnerSql(
  sql: string,
  variables: Record<string, string> = {},
): SpawnSyncReturns<string> {
  return spawnSync(
    'psql',
    [
      '-X',
      '-qAt',
      '-v',
      'ON_ERROR_STOP=1',
      ...Object.entries(variables).flatMap(([name, value]) => ['-v', `${name}=${value}`]),
      '-h',
      '127.0.0.1',
      '-p',
      '54322',
      '-U',
      'postgres',
      '-d',
      'postgres',
    ],
    {
      env: { ...process.env, PGPASSWORD: 'postgres' },
      encoding: 'utf8',
      input: `\\set VERBOSITY verbose\n${sql}`,
    },
  );
}

function expectConstraintViolation(
  result: SpawnSyncReturns<string>,
  constraintName: (typeof stagedConstraintNames)[number],
): void {
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('23514');
  expect(result.stderr).toContain('violates check constraint');
  expect(result.stderr).toContain(constraintName);
}

describe.skipIf(!RUN_LOCAL)('MCP Candidate 4 OAuth scope constraints', () => {
  beforeAll(async () => {
    const { error } = await admin.auth.admin.createUser({
      id: userId,
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;

    const fixture = runOwnerSql(
      `
        INSERT INTO public.oauth_connections (
          id,
          user_id,
          client_id,
          resource_uri,
          scopes,
          write_enabled_at
        ) VALUES (
          :'connection_id'::UUID,
          :'user_id'::UUID,
          'chatgpt',
          :'resource_uri',
          ARRAY[
            'read:entries',
            'write:plans',
            'delete:plans',
            'write:records',
            'delete:records'
          ]::TEXT[],
          pg_catalog.now()
        );

        INSERT INTO public.oauth_authorization_codes (
          code_hash,
          user_id,
          client_id,
          redirect_uri,
          code_challenge,
          code_challenge_method,
          scopes,
          connection_id,
          resource_uri
        ) VALUES (
          :'code_hash',
          :'user_id'::UUID,
          'chatgpt',
          'https://chatgpt.com/connector_platform_oauth_redirect',
          'candidate-4-challenge',
          'S256',
          ARRAY[
            'read:entries',
            'write:plans',
            'delete:plans',
            'write:records',
            'delete:records'
          ]::TEXT[],
          :'connection_id'::UUID,
          :'resource_uri'
        );

        INSERT INTO public.oauth_tokens (
          id,
          user_id,
          token_hash,
          token_type,
          client_id,
          scopes,
          expires_at,
          connection_id,
          resource_uri
        ) VALUES (
          :'token_id'::UUID,
          :'user_id'::UUID,
          'candidate-4-token-' || :'token_id',
          'access',
          'chatgpt',
          ARRAY[
            'read:entries',
            'write:plans',
            'delete:plans',
            'write:records',
            'delete:records'
          ]::TEXT[],
          pg_catalog.now() + INTERVAL '5 minutes',
          :'connection_id'::UUID,
          :'resource_uri'
        );
      `,
      {
        user_id: userId,
        connection_id: connectionId,
        token_id: tokenId,
        code_hash: codeHash,
        resource_uri: productionResource,
      },
    );

    if (fixture.status !== 0) {
      throw new Error(fixture.stderr || 'Candidate 4 fixture setup failed');
    }
  });

  afterAll(async () => {
    await admin.auth.admin.deleteUser(userId);
  });

  it('adds only the three staged checks without preflight or validation', () => {
    expect(candidateMigration.match(/NOT VALID;/g)).toHaveLength(3);
    expect(candidateMigration).not.toContain('VALIDATE CONSTRAINT');
    expect(candidateMigration).not.toContain('GRANT ');
    expect(candidateMigration).not.toContain('REVOKE ');
    expect(candidateMigration).not.toContain('UPDATE public.mcp_mutation_control');

    for (const scope of ['write:plans', 'delete:plans', 'write:records', 'delete:records']) {
      expect(candidateMigration.match(new RegExp(`'${scope}'`, 'g'))).toHaveLength(3);
    }
  });

  it('leaves staged checks unvalidated and existing resource FKs validated', () => {
    const result = runOwnerSql(`
      SELECT c.conname || '|' || c.contype::TEXT || '|' || c.convalidated::TEXT
      FROM pg_constraint AS c
      JOIN pg_class AS relation ON relation.oid = c.conrelid
      JOIN pg_namespace AS schema ON schema.oid = relation.relnamespace
      WHERE schema.nspname = 'public'
        AND c.conname = ANY (ARRAY[
          ${[...stagedConstraintNames, ...existingResourceConstraintNames]
            .map((name) => `'${name}'`)
            .join(',\n          ')}
        ]::TEXT[])
      ORDER BY c.conname;
    `);

    expect(result.status).toBe(0);
    const catalogRows = result.stdout.trim().split('\n');
    expect(catalogRows).toEqual(
      [...existingResourceConstraintNames]
        .sort()
        .map((name) => `${name}|f|true`)
        .concat([...stagedConstraintNames].sort().map((name) => `${name}|c|false`))
        .sort(),
    );
  });

  it('accepts read plus write scopes while every write gate remains off', () => {
    const result = runOwnerSql(
      `
        SELECT
          (
            SELECT count(*) = 3
            FROM (
              SELECT scopes
              FROM public.oauth_connections
              WHERE id = :'connection_id'::UUID
              UNION ALL
              SELECT scopes
              FROM public.oauth_authorization_codes
              WHERE code_hash = :'code_hash'
              UNION ALL
              SELECT scopes
              FROM public.oauth_tokens
              WHERE id = :'token_id'::UUID
            ) AS valid_rows
            WHERE 'read:entries' = ANY (scopes)
              AND scopes && ARRAY[
                'write:plans',
                'delete:plans',
                'write:records',
                'delete:records'
              ]::TEXT[]
          )
          AND (
            SELECT NOT writes_enabled
              AND COALESCE(pg_catalog.cardinality(enabled_client_ids), 0) = 0
            FROM public.mcp_mutation_control
            WHERE singleton_key = true
          );
      `,
      {
        connection_id: connectionId,
        token_id: tokenId,
        code_hash: codeHash,
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('t');
  });

  it('rejects new write-only rows through each staged constraint', () => {
    const connectionInsert = runOwnerSql(
      `
        INSERT INTO public.oauth_connections (
          user_id,
          client_id,
          resource_uri,
          scopes,
          write_enabled_at
        ) VALUES (
          :'user_id'::UUID,
          'chatgpt',
          :'resource_uri',
          ARRAY['write:plans']::TEXT[],
          pg_catalog.now()
        );
      `,
      { user_id: userId, resource_uri: productionResource },
    );
    expectConstraintViolation(
      connectionInsert,
      'oauth_connections_write_requires_read_entries_check',
    );

    const codeInsert = runOwnerSql(
      `
        INSERT INTO public.oauth_authorization_codes (
          code_hash,
          user_id,
          client_id,
          redirect_uri,
          code_challenge,
          code_challenge_method,
          scopes,
          connection_id,
          resource_uri
        ) VALUES (
          'candidate-4-invalid-code-' || :'user_id',
          :'user_id'::UUID,
          'chatgpt',
          'https://chatgpt.com/connector_platform_oauth_redirect',
          'candidate-4-challenge',
          'S256',
          ARRAY['write:plans']::TEXT[],
          :'connection_id'::UUID,
          :'resource_uri'
        );
      `,
      {
        user_id: userId,
        connection_id: connectionId,
        resource_uri: productionResource,
      },
    );
    expectConstraintViolation(
      codeInsert,
      'oauth_authorization_codes_write_requires_read_entries_check',
    );

    const tokenInsert = runOwnerSql(
      `
        INSERT INTO public.oauth_tokens (
          user_id,
          token_hash,
          token_type,
          client_id,
          scopes,
          expires_at,
          connection_id,
          resource_uri
        ) VALUES (
          :'user_id'::UUID,
          'candidate-4-invalid-token-' || :'user_id',
          'access',
          'chatgpt',
          ARRAY['write:plans']::TEXT[],
          pg_catalog.now() + INTERVAL '5 minutes',
          :'connection_id'::UUID,
          :'resource_uri'
        );
      `,
      {
        user_id: userId,
        connection_id: connectionId,
        resource_uri: productionResource,
      },
    );
    expectConstraintViolation(tokenInsert, 'oauth_tokens_write_requires_read_entries_check');
  });

  it('rejects updates from valid rows to write-only scopes', () => {
    const connectionUpdate = runOwnerSql(
      `
        UPDATE public.oauth_connections
        SET scopes = ARRAY['write:plans']::TEXT[]
        WHERE id = :'connection_id'::UUID;
      `,
      { connection_id: connectionId },
    );
    expectConstraintViolation(
      connectionUpdate,
      'oauth_connections_write_requires_read_entries_check',
    );

    const codeUpdate = runOwnerSql(
      `
        UPDATE public.oauth_authorization_codes
        SET scopes = ARRAY['write:plans']::TEXT[]
        WHERE code_hash = :'code_hash';
      `,
      { code_hash: codeHash },
    );
    expectConstraintViolation(
      codeUpdate,
      'oauth_authorization_codes_write_requires_read_entries_check',
    );

    const tokenUpdate = runOwnerSql(
      `
        UPDATE public.oauth_tokens
        SET scopes = ARRAY['write:plans']::TEXT[]
        WHERE id = :'token_id'::UUID;
      `,
      { token_id: tokenId },
    );
    expectConstraintViolation(tokenUpdate, 'oauth_tokens_write_requires_read_entries_check');
  });

  it('preserves the mixed-version OAuth compatibility grants', () => {
    const result = runOwnerSql(`
      SELECT
        pg_catalog.has_table_privilege(
          'authenticated',
          'public.oauth_connections',
          'SELECT'
        )
        AND NOT pg_catalog.has_table_privilege(
          'authenticated',
          'public.oauth_connections',
          'INSERT'
        )
        AND NOT pg_catalog.has_table_privilege(
          'authenticated',
          'public.oauth_tokens',
          'SELECT'
        )
        AND pg_catalog.has_column_privilege(
          'authenticated',
          'public.oauth_tokens',
          'id',
          'SELECT'
        )
        AND NOT pg_catalog.has_column_privilege(
          'authenticated',
          'public.oauth_tokens',
          'token_hash',
          'SELECT'
        )
        AND NOT pg_catalog.has_table_privilege(
          'service_role',
          'public.oauth_connections',
          'INSERT'
        )
        AND pg_catalog.has_column_privilege(
          'service_role',
          'public.oauth_connections',
          'last_used_at',
          'UPDATE'
        )
        AND pg_catalog.has_table_privilege(
          'service_role',
          'public.oauth_authorization_codes',
          'INSERT'
        )
        AND pg_catalog.has_table_privilege(
          'service_role',
          'public.oauth_tokens',
          'INSERT'
        );
    `);

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('t');
  });
});
