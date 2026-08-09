import { expect, type Page, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import type { AppRouter } from '@/lib/trpc/root';
import type { inferRouterOutputs } from '@trpc/server';

import type { Database } from '@/lib/database';
import { resolveServiceRoleTarget } from './service-role-target-guard';
import { suppressConsentBanner } from './suppress-consent-banner';
import {
  fulfillTrpcProcedure,
  fulfillTrpcResponse,
  trpcProcedureRoutePattern,
} from './trpc-response-mock';

/**
 * Billing E2E — Checkout / Customer Portal への遷移導線を検証する。
 *
 * Stripe からの復帰導線（`?success=true` / `?canceled=true`）は対象外。遷移先の
 * `/settings/subscription` が有効な設定カテゴリではなく白紙になるため検証できない
 * （#1881）。修正後にここへ追加する。
 *
 * Stripe 自体は叩かない。`billing.createCheckoutSession` / `billing.createPortalSession`
 * の tRPC レスポンスを `page.route` で intercept し、client が実際に
 * `window.location.href` で Stripe のホスト（checkout.stripe.com /
 * billing.stripe.com）へ遷移しようとすることだけを確認する
 * （`BillingSettings.tsx` の `onSuccess` 参照）。Stripe 側の遷移リクエストは
 * `route.abort()` してテスト実行を Stripe に依存させない。
 *
 * seed は service role で自前ユーザーを作る（critical-path.spec.ts と同型）。
 * 実行先は resolveServiceRoleTarget が安全と判定した時だけ有効になる。
 */

type RouterOutputs = inferRouterOutputs<AppRouter>;
type CheckoutSessionResponse = RouterOutputs['billing']['createCheckoutSession'];
type PortalSessionResponse = RouterOutputs['billing']['createPortalSession'];
type BillingOverviewResponse = RouterOutputs['billing']['getOverview'];

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
// service role で auth user / profile を作って消すため、実行先が安全な時だけ有効にする
const SERVICE_ROLE_TARGET = resolveServiceRoleTarget(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const describeWithEnv = SERVICE_ROLE_TARGET.safe ? test.describe : test.describe.skip;

const TEST_RUN_ID = crypto.randomUUID();
const TEST_USER_ID = crypto.randomUUID();
const TEST_EMAIL = `billing-${TEST_RUN_ID}@example.com`;
const TEST_PASSWORD = 'test-password-123';

const DUMMY_CHECKOUT_URL = 'https://checkout.stripe.com/c/pay/e2e-dummy';
const DUMMY_PORTAL_URL = 'https://billing.stripe.com/p/session/e2e-dummy';

type SupabaseClient = ReturnType<typeof createClient<Database>>;

async function login(page: Page) {
  await suppressConsentBanner(page);
  await page.goto('/ja/auth/login');
  await page.locator('input[type="email"], input[name="email"]').first().fill(TEST_EMAIL);
  await page.locator('input[type="password"]').first().fill(TEST_PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/ja\/(day|week)/i, { timeout: 15_000 });
}

/**
 * 設定 > 課金カテゴリへ遷移する。
 *
 * desktop は `/settings/[category]/page.tsx` が `openSettings(category)` +
 * `router.replace('/')` するため、ホームへ戻った上で SettingsDialog が開く
 * （GlobalOverlays.tsx に常駐）。mobile はページ遷移のまま留まる。
 */
async function openBillingSettings(page: Page) {
  await page.goto('/ja/settings/billing');
}

describeWithEnv('Billing: Checkout / Portal 導線', () => {
  test.describe.configure({ mode: 'serial' });

  let adminSupabase: SupabaseClient;

  test.beforeAll(async () => {
    adminSupabase = createClient<Database>(SUPABASE_URL!, SUPABASE_SERVICE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error: authError } = await adminSupabase.auth.admin.createUser({
      id: TEST_USER_ID,
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: 'billing e2e' },
    });
    // CI retries:2 + serial mode の再実行で "already exists" になりうるため許容する
    if (authError && !authError.message.includes('already exists')) {
      throw new Error(authError.message);
    }

    // 既定は Free プラン（stripe_customer_id 無し、subscription_status は DB 側 default 'free'）
    const { error: profileError } = await adminSupabase.from('profiles').upsert({
      id: TEST_USER_ID,
      email: TEST_EMAIL,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (profileError) throw new Error(profileError.message);

    const { error: settingsError } = await adminSupabase.from('user_settings').upsert({
      user_id: TEST_USER_ID,
      timezone: 'Asia/Tokyo',
      preferred_locale: 'ja',
      default_view: 'day',
      default_duration: 60,
      time_format: '24h',
      week_starts_on: 1,
    });
    if (settingsError) throw new Error(settingsError.message);
  });

  test.afterAll(async () => {
    if (!adminSupabase) return;

    const { error: settingsError, status: settingsStatus } = await adminSupabase
      .from('user_settings')
      .delete()
      .eq('user_id', TEST_USER_ID);
    if (settingsError && settingsStatus !== 404) {
      console.error('[billing.spec] user_settings cleanup failed', settingsError);
    }

    const { error: profileError, status: profileStatus } = await adminSupabase
      .from('profiles')
      .delete()
      .eq('id', TEST_USER_ID);
    if (profileError && profileStatus !== 404) {
      console.error('[billing.spec] profiles cleanup failed', profileError);
    }

    const { error: authDeleteError } = await adminSupabase.auth.admin.deleteUser(TEST_USER_ID);
    // ユーザーが既に存在しない場合も成功扱い（冪等な cleanup）
    if (authDeleteError && !authDeleteError.message.toLowerCase().includes('not found')) {
      console.error('[billing.spec] auth user cleanup failed', authDeleteError);
    }
  });

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name.includes('Mobile'),
      'desktop-only（Stripe host route intercept と SettingsDialog 前提の検証）',
    );
    await login(page);
  });

  test('アップグレード操作で Stripe Checkout へ遷移しようとする', async ({ page }) => {
    test.skip(
      !process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID,
      'NEXT_PUBLIC_STRIPE_PRO_PRICE_ID 未設定（未設定だとアップグレードボタンが disabled のまま）',
    );

    await page.route('**/api/trpc/billing.createCheckoutSession*', (route) =>
      fulfillTrpcResponse<CheckoutSessionResponse>(route, { url: DUMMY_CHECKOUT_URL }),
    );
    // Stripe 自体は叩かない。遷移が試みられたことだけを確認して即 abort する
    await page.route('https://checkout.stripe.com/**', (route) => route.abort());

    await openBillingSettings(page);

    const upgradeButton = page.getByRole('button', { name: 'アップグレード' });
    await expect(upgradeButton).toBeVisible({ timeout: 10_000 });
    await expect(upgradeButton).toBeEnabled();

    const stripeRequestPromise = page.waitForRequest((request) =>
      request.url().startsWith('https://checkout.stripe.com/'),
    );

    await upgradeButton.click();

    const stripeRequest = await stripeRequestPromise;
    expect(stripeRequest.url()).toBe(DUMMY_CHECKOUT_URL);
  });

  test('プラン調整操作で Stripe Customer Portal へ遷移しようとする', async ({ page }) => {
    // "プランを調整" ボタンは canAccessPro 限定なので、Pro ユーザーの overview を返す。
    //
    // profiles.stripe_customer_id を実 DB に upsert する案は採れない。getBillingOverview は
    // stripeCustomerId が非 null だと requireStripe() 経由で実 Stripe を呼ぶため
    // （billing-service.ts:363-374）、STRIPE_SECRET_KEY を渡さないローカル / CI では
    // billing.getOverview が INTERNAL_SERVER_ERROR になり画面が ErrorState に落ちる。
    // read 側も mock して Stripe には一切到達させない。
    //
    // 登録に trpcProcedureRoutePattern を使うのは、userSettings.get の prefetch と同一 tick で
    // batch されると URL が `billing.getOverview` 単体でなくなるため（同ファイルの doc 参照）。
    await page.route(trpcProcedureRoutePattern('billing.getOverview'), (route) =>
      fulfillTrpcProcedure<BillingOverviewResponse>(route, 'billing.getOverview', {
        billingInfo: {
          subscriptionStatus: 'active',
          stripeCustomerId: 'cus_e2e_dummy',
          subscriptionId: null,
        },
        paymentMethod: null,
        invoices: [],
        trialEndsAt: null,
      }),
    );
    await page.route('**/api/trpc/billing.createPortalSession*', (route) =>
      fulfillTrpcResponse<PortalSessionResponse>(route, { url: DUMMY_PORTAL_URL }),
    );
    // Stripe 自体は叩かない。遷移が試みられたことだけを確認して即 abort する
    await page.route('https://billing.stripe.com/**', (route) => route.abort());

    await openBillingSettings(page);

    const adjustPlanButton = page.getByRole('button', { name: 'プランを調整' });
    await expect(adjustPlanButton).toBeVisible({ timeout: 10_000 });
    await expect(adjustPlanButton).toBeEnabled();

    const stripeRequestPromise = page.waitForRequest((request) =>
      request.url().startsWith('https://billing.stripe.com/'),
    );

    await adjustPlanButton.click();

    const stripeRequest = await stripeRequestPromise;
    expect(stripeRequest.url()).toBe(DUMMY_PORTAL_URL);
  });
});
