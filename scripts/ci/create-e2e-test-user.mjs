#!/usr/bin/env node

/**
 * E2E 用の一時テストユーザーを service role で作成する。
 *
 * TEST_USER_* 依存の spec（deep-link / review-granularity / smoke 認証部 /
 * auth 認証部）は自前でユーザーを作らず、ログイン可能なユーザーが既に
 * 存在することだけを前提にする。critical-path.spec.ts / block-search.spec.ts
 * 等の service-role seed（tag / plan / record まで作る）とはライフサイクルが
 * 別（ログインできれば足りる）ため、この script を独立させる。
 *
 * ランナーは実行ごとに使い捨てなので、作成したユーザーの後始末はしない。
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/ci/create-e2e-test-user.mjs
 *
 * 出力: GITHUB_OUTPUT が設定されていれば `email=` / `password=` をそこへ書く。
 *       未設定（ローカル実行）時は stdout に書く。
 */

import { appendFileSync } from 'node:fs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定');
  process.exit(1);
}

const runId = crypto.randomUUID();
const email = `e2e-auth-${runId}@example.com`;
const password = `E2e-${runId}`;

async function createUser() {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'e2e auth user' },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`auth admin createUser failed (${response.status}): ${body}`);
  }

  return response.json();
}

async function upsertProfile(userId) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify([
      {
        id: userId,
        email,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`profiles upsert failed (${response.status}): ${body}`);
  }
}

const { id: userId } = await createUser();
await upsertProfile(userId);

const githubOutput = process.env.GITHUB_OUTPUT;
if (githubOutput) {
  appendFileSync(githubOutput, `email=${email}\npassword=${password}\n`);
} else {
  console.log(`email=${email}`);
  console.log(`password=${password}`);
}
