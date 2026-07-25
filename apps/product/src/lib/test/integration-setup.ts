import { vi } from 'vitest';

const LOCAL_DB_URL = 'http://127.0.0.1:54321';
const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5Nn0.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const LOCAL_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

function readJwtFixture(value: string): { iss?: unknown; role?: unknown } {
  const encodedPayload = value.split('.')[1];
  if (!encodedPayload) throw new Error('Local Supabase fixture JWT is malformed');

  try {
    return JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as {
      iss?: unknown;
      role?: unknown;
    };
  } catch {
    throw new Error('Local Supabase fixture JWT payload is malformed');
  }
}

function assertLocalJwtFixture(value: string, role: 'anon' | 'service_role'): void {
  const payload = readJwtFixture(value);
  if (payload.iss !== 'supabase-demo' || payload.role !== role) {
    throw new Error('Integration tests require the known local Supabase JWT issuer and role');
  }
}

if (process.env.USE_LOCAL_DB === 'true') {
  // Never combine an ambient Production credential with localhost. A local run
  // always uses the checked-in Supabase CLI fixture pair.
  process.env.NEXT_PUBLIC_SUPABASE_URL = LOCAL_DB_URL;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = LOCAL_ANON_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = LOCAL_SERVICE_ROLE_KEY;
  assertLocalJwtFixture(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'anon');
  assertLocalJwtFixture(process.env.SUPABASE_SERVICE_ROLE_KEY, 'service_role');
} else {
  // Server services create their own Supabase client. Keep those clients on the
  // same local project as direct integration-test clients when env is absent.
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= LOCAL_DB_URL;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= LOCAL_ANON_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= LOCAL_SERVICE_ROLE_KEY;
}

// server-only: テスト環境ではサーバーコンポーネント制約を無効化
vi.mock('server-only', () => ({}));
