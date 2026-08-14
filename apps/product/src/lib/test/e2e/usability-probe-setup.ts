#!/usr/bin/env tsx
/**
 * Haiku ユーザビリティプローブ用の認証済み storageState を用意する。
 *
 * 「credential をモデルに触らせない」（#2022）の実装。スローアウェイ test user を
 * service role で作り、このスクリプト自身が headless Playwright でログインフォームへ
 * 入力する。パスワードは probe agent（Haiku）には一切見せず、ログイン後の
 * storageState（cookie）だけをファイルへ書き出す。probe agent は on-demand 登録した
 * 専用 Playwright MCP（`--storage-state=<このファイル>`）経由でこの storageState を
 * 読み込んだブラウザを操作する（agent 自身は storageState ファイルにも触れない）。
 *
 * 実行先の安全性は `service-role-target-guard.ts` にそのまま従う（local / preview
 * のみ既定許可、production は opt-in があっても拒否）。
 *
 * Usage:
 *   pnpm --filter @dayopt/product probe:setup
 *   pnpm --filter @dayopt/product probe:setup -- --base-url=http://localhost:3000
 *
 * 前提: 対象アプリが起動していること（ローカルなら `pnpm dev:raw`）。
 *
 * 後始末: 作成した test user は自動で消さない。標準出力に出る email を
 * `USER_EMAIL=<email> bash scripts/admin-delete-user.sh` で削除する。
 * 専用の cleanup script は書かない（既存の管理スクリプトを使い回す）。
 *
 * @see docs/product/log — プローブの所見はここに記録される（本スクリプトの管轄外）
 * @see .claude/skills/usability-probe/SKILL.md — このスクリプトを呼ぶオーケストレーション
 */

import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database';

import { resolveServiceRoleTarget } from './service-role-target-guard';
import { suppressConsentBanner } from './suppress-consent-banner';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, '../../../../..');
const DEFAULT_STORAGE_STATE_PATH = resolve(APP_ROOT, '.probe/storage-state.json');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function parseBaseUrl(argv: string[]): string {
  const flag = argv.find((arg) => arg.startsWith('--base-url='));
  return flag ? flag.slice('--base-url='.length) : 'http://localhost:3000';
}

function parseStorageStatePath(argv: string[]): string {
  const flag = argv.find((arg) => arg.startsWith('--storage-state='));
  return flag ? resolve(flag.slice('--storage-state='.length)) : DEFAULT_STORAGE_STATE_PATH;
}

async function main() {
  const target = resolveServiceRoleTarget(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  if (!target.safe) {
    console.error(`[usability-probe-setup] 実行を中止: ${target.reason}`);
    process.exitCode = 1;
    return;
  }

  const baseUrl = parseBaseUrl(process.argv.slice(2));
  const storageStatePath = parseStorageStatePath(process.argv.slice(2));

  const runId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const email = `usability-probe-${runId}@example.com`;
  // probe agent には見せない。このプロセス内でのみ使い、ログイン後は破棄する。
  const password = crypto.randomUUID();

  const adminSupabase = createClient<Database>(SUPABASE_URL!, SUPABASE_SERVICE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error: authError } = await adminSupabase.auth.admin.createUser({
    id: userId,
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'usability probe' },
  });
  if (authError) throw new Error(`test user 作成に失敗: ${authError.message}`);

  await adminSupabase.from('profiles').upsert({
    id: userId,
    email,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  await adminSupabase.from('user_settings').upsert({
    user_id: userId,
    timezone: 'Asia/Tokyo',
    preferred_locale: 'ja',
    default_view: 'day',
    default_duration: 60,
    time_format: '24h',
    week_starts_on: 1,
  });

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await suppressConsentBanner(page);
    await page.goto(`${baseUrl}/ja/auth/login`);
    await page.locator('input[type="email"], input[name="email"]').first().fill(email);
    await page.locator('input[type="password"]').first().fill(password);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL(/\/ja\/(day|week)/i, { timeout: 15_000 });

    mkdirSync(dirname(storageStatePath), { recursive: true });
    await context.storageState({ path: storageStatePath });
  } finally {
    await browser.close();
  }

  // 実行メタデータ（cleanup 用の userId、生成元 runId）を storageState の隣に残す。
  // password は含めない（既にセッション化済みで不要）。
  writeFileSync(
    resolve(dirname(storageStatePath), 'session-meta.json'),
    JSON.stringify({ runId, userId, email, createdAt: new Date().toISOString() }, null, 2) + '\n',
  );

  console.log(`[usability-probe-setup] storageState: ${storageStatePath}`);
  console.log(`[usability-probe-setup] email (cleanup 用): ${email}`);
  console.log(
    `[usability-probe-setup] cleanup: USER_EMAIL=${email} bash scripts/admin-delete-user.sh`,
  );
}

main().catch((error) => {
  console.error('[usability-probe-setup] failed:', error);
  process.exitCode = 1;
});
