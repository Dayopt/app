/**
 * PWA オフライン→オンライン同期 E2Eテスト
 *
 * カバー範囲:
 *   1. PWAインストール要件（manifest, service worker, オフラインページ）
 *   2. オフライン→オンライン同期フロー（エントリ作成のキューイング）
 *   3. Service Worker アップデートの検出と適用
 *   4. インストールバナーの表示と抑制
 *
 * 前提条件:
 *   - TEST_USER_EMAIL / TEST_USER_PASSWORD 環境変数が設定されていること
 *   - アプリが本番ビルドで起動していること（`next start`）
 *     ※ Service Worker は本番ビルドでのみ有効
 *
 * NOTE: 実インフラ（Supabase接続など）が必要なテストは test.skip() でマーク済み。
 *       スケルトンとして構造のみ定義しており、詳細実装は TODO コメントを参照。
 */

import { expect, test, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** テストユーザー認証情報 */
const TEST_EMAIL = process.env.TEST_USER_EMAIL ?? '';
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD ?? '';

/** テスト用エントリのタイトル */
const OFFLINE_ENTRY_TITLE = '[PWA-TEST] オフライン作成エントリ';

/** IndexedDB データベース名（TanStack Query Persist アダプタ） */
// TODO: 実際の DB 名を確認して更新すること
// 確認方法: DevTools > Application > IndexedDB
const IDB_DATABASE_NAME = 'tanstack-query-offline-cache';

// ---------------------------------------------------------------------------
// ヘルパー関数
// ---------------------------------------------------------------------------

/**
 * テストユーザーでログインし、カレンダーページに遷移する。
 * 認証情報未設定の場合は即座にエラーをスローする。
 */
async function loginAndNavigateToCalendar(page: Page): Promise<void> {
  if (!TEST_EMAIL || !TEST_PASSWORD) {
    throw new Error(
      'TEST_USER_EMAIL / TEST_USER_PASSWORD が未設定です。\n' +
        'npx playwright test を実行する前に環境変数を設定してください。',
    );
  }

  await page.goto('/ja/auth/login');
  await page.waitForLoadState('networkidle');

  await page.fill('input[type="email"]', TEST_EMAIL);
  await page.fill('input[type="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');

  // カレンダーページへのリダイレクトを待つ
  await page.waitForURL(/\/(day|week|calendar)/i, { timeout: 15_000 });
  await page.waitForLoadState('networkidle');
}

/**
 * Service Worker が登録されているかを確認する。
 * 登録済みなら SW の scope URL を返す。未登録なら null を返す。
 */
async function getRegisteredServiceWorker(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return null;
    const registrations = await navigator.serviceWorker.getRegistrations();
    if (registrations.length === 0) return null;
    return registrations[0]?.scope ?? null;
  });
}

/**
 * IndexedDB から TanStack Query のオフラインキューを読み取る。
 *
 * TODO: 実際のキースキーマに合わせて実装する。
 *       現時点ではスタブとして空配列を返す。
 */
async function readOfflineQueue(page: Page): Promise<unknown[]> {
  // TODO: 実際の IndexedDB 読み取り実装
  // 参考: page.evaluate() 内で indexedDB.open() を使用する
  // 例:
  // return page.evaluate(async (dbName) => {
  //   return new Promise((resolve, reject) => {
  //     const req = indexedDB.open(dbName);
  //     req.onsuccess = (e) => {
  //       const db = (e.target as IDBOpenDBRequest).result;
  //       const tx = db.transaction('mutations', 'readonly');
  //       const store = tx.objectStore('mutations');
  //       const getAll = store.getAll();
  //       getAll.onsuccess = () => resolve(getAll.result);
  //       getAll.onerror = () => reject(getAll.error);
  //     };
  //     req.onerror = () => reject(req.error);
  //   });
  // }, IDB_DATABASE_NAME);
  void IDB_DATABASE_NAME; // suppress unused variable warning until TODO is implemented
  return page.evaluate(() => [] as unknown[]);
}

// ---------------------------------------------------------------------------
// 1. PWA インストール要件
// ---------------------------------------------------------------------------

test.describe('PWA: インストール要件', () => {
  test('ページに有効な Web App Manifest が存在する', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // <link rel="manifest"> が存在することを確認
    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(manifestHref).toBeTruthy();

    // manifest.json の内容を取得して必須フィールドを検証
    const manifestUrl = new URL(manifestHref!, page.url());
    const response = await page.request.get(manifestUrl.toString());
    expect(response.status()).toBe(200);

    const manifest = (await response.json()) as Record<string, unknown>;

    // PWA 必須フィールドの検証
    expect(manifest).toHaveProperty('name');
    expect(manifest).toHaveProperty('start_url');
    expect(manifest).toHaveProperty('display');
    expect(manifest).toHaveProperty('icons');

    const icons = manifest['icons'] as Array<Record<string, unknown>>;
    expect(Array.isArray(icons)).toBe(true);
    expect(icons.length).toBeGreaterThan(0);

    // 192x192 と 512x512 アイコンが存在することを確認
    const sizes = icons.map((icon) => icon['sizes'] as string);
    expect(sizes.some((s) => s.includes('192'))).toBe(true);
    expect(sizes.some((s) => s.includes('512'))).toBe(true);
  });

  test('Service Worker が登録されている', async ({ page }) => {
    // NOTE: SW は本番ビルド（next start）でのみ登録される。
    //       開発サーバー（next dev）では登録されないため、
    //       CI では `npm run build && npm run start` で起動すること。
    test.skip(process.env.NODE_ENV !== 'production', 'Service Worker は本番ビルドでのみ動作します');

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // SW の登録が完了するまで待機（最大 5 秒）
    // TODO: アプリの SW 登録完了イベントに応じて待機方法を調整する
    await page.waitForTimeout(2_000);

    const scope = await getRegisteredServiceWorker(page);
    expect(scope).not.toBeNull();
  });

  test('オフライン時に /offline ページまたはキャッシュコンテンツが表示される', async ({
    context,
    page,
  }) => {
    test.skip(process.env.NODE_ENV !== 'production', 'Service Worker は本番ビルドでのみ動作します');

    // まず通常表示してキャッシュを温める
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // オフラインに設定
    await context.setOffline(true);

    // ページをリロード
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {
      // オフライン時はナビゲーションエラーが発生しうるので catch する
    });

    // /offline フォールバックページ、またはキャッシュされたコンテンツが
    // 表示されることを確認する
    // TODO: オフライン表示の実際の UI に合わせてセレクタを更新すること
    const offlineIndicator = page.locator(
      '[data-testid="offline-page"], [data-testid="offline-banner"], h1:has-text("オフライン"), h1:has-text("Offline")',
    );

    // キャッシュコンテンツが表示された場合の代替確認
    const hasContent = await page.locator('body').textContent();
    expect(hasContent?.length).toBeGreaterThan(0);

    // オフライン専用UIが表示されていれば、その可視性を確認
    if ((await offlineIndicator.count()) > 0) {
      await expect(offlineIndicator.first()).toBeVisible();
    }

    // オンラインに戻す（後続テストへの影響を防ぐ）
    await context.setOffline(false);
  });
});

// ---------------------------------------------------------------------------
// 2. オフライン → オンライン 同期フロー
// ---------------------------------------------------------------------------

test.describe('PWA: オフライン→オンライン同期フロー', () => {
  test.skip(!TEST_EMAIL, 'TEST_USER_EMAIL / TEST_USER_PASSWORD が未設定');

  test.beforeEach(async ({ page }) => {
    await loginAndNavigateToCalendar(page);
  });

  test('オフライン中にエントリを作成するとキューに保存される', async ({ context, page }) => {
    test.skip(
      true,
      'TODO: IndexedDB のキースキーマ確定後に実装する。' +
        'readOfflineQueue() の実装と IDB_DATABASE_NAME の確認が必要。',
    );

    // オフラインに切り替え
    await context.setOffline(true);

    // TODO: オフライン状態を示す UI インジケータが表示されることを確認
    // 例: await expect(page.locator('[data-testid="offline-indicator"]')).toBeVisible();

    // エントリ作成ボタンをクリック
    // TODO: 実際の作成ボタンのセレクタに更新すること
    const createButton = page
      .locator(
        'button[aria-label*="作成"], button[aria-label*="create"], button[data-testid="create-entry"]',
      )
      .first();
    await createButton.click();

    // エントリタイトルを入力
    // TODO: Inspector の入力フィールドのセレクタを確認すること
    const titleInput = page
      .locator('input[placeholder*="タイトル"], input[data-testid="entry-title-input"]')
      .first();
    await titleInput.fill(OFFLINE_ENTRY_TITLE);

    // 保存操作
    // TODO: 保存ボタンまたはキーボードショートカットを確認すること
    await page.keyboard.press('Enter');

    // IndexedDB のオフラインキューにエントリが保存されたことを確認
    const queue = await readOfflineQueue(page);
    expect(queue.length).toBeGreaterThan(0);

    // オンラインに戻す
    await context.setOffline(false);
  });

  test('オンライン復帰後にオフラインキューのエントリが同期される', async ({ context, page }) => {
    test.skip(
      true,
      'TODO: バックエンドとの結合テスト。' +
        'ステージング環境または専用テスト環境が必要。' +
        'Supabase への実際の書き込みが発生するため、テストデータのクリーンアップも必要。',
    );

    // --- Phase 1: オフラインでエントリを作成 ---
    await context.setOffline(true);

    // TODO: エントリ作成の UI 操作を実装
    // const createButton = page.locator(...);
    // await createButton.click();
    // ...

    // --- Phase 2: オンラインに復帰して同期を確認 ---
    await context.setOffline(false);

    // 同期完了を待つ
    // TODO: 同期完了のインジケータ（スピナー消灯など）を待つ実装を追加
    await page.waitForLoadState('networkidle');

    // カレンダー上にエントリが表示されることを確認
    // TODO: エントリカードのセレクタを確認すること
    const entryCard = page
      .locator(
        `[data-testid="entry-card"]:has-text("${OFFLINE_ENTRY_TITLE}"), .entry-card:has-text("${OFFLINE_ENTRY_TITLE}")`,
      )
      .first();
    await expect(entryCard).toBeVisible({ timeout: 15_000 });
  });

  test('オフライン中のミューテーションが失敗扱いにならない', async ({ context, page }) => {
    test.skip(
      true,
      'TODO: TanStack Query のオフラインミューテーション動作の確認が必要。' +
        'pauseMutations / resumeMutations の実装状況を確認すること。',
    );

    await context.setOffline(true);

    // TODO: エントリ作成を試みる
    // オフライン時はエラートーストが表示されず、
    // キューに入ったことを示す UI が表示されることを確認する

    // エラートーストが表示されないことを確認
    const errorToast = page.locator(
      '[data-testid="toast-error"], [role="alert"][aria-live="assertive"]',
    );
    // 短い時間待ってもエラートーストが表示されないことを確認
    await expect(errorToast).not.toBeVisible();

    await context.setOffline(false);
  });

  test('ネットワーク復帰時に同期インジケータが表示される', async ({ context, page }) => {
    test.skip(
      true,
      'TODO: 同期中の UI インジケータのセレクタを確認してから実装する。' +
        '現在の実装に同期インジケータが存在しない場合は、実装追加が必要。',
    );

    // オフラインでキューにデータを積む
    await context.setOffline(true);
    // TODO: エントリ作成操作

    // オンライン復帰
    await context.setOffline(false);

    // 同期中インジケータを確認
    // TODO: 実際の同期インジケータのセレクタを指定する
    const syncIndicator = page.locator('[data-testid="sync-indicator"], [aria-label*="同期中"]');
    await expect(syncIndicator).toBeVisible({ timeout: 5_000 });

    // 同期完了後にインジケータが消えることを確認
    await expect(syncIndicator).not.toBeVisible({ timeout: 15_000 });
  });
});

// ---------------------------------------------------------------------------
// 3. Service Worker アップデート
// ---------------------------------------------------------------------------

test.describe('PWA: Service Worker アップデート', () => {
  test.skip(process.env.NODE_ENV !== 'production', 'Service Worker は本番ビルドでのみ動作します');

  test('SW アップデートが検出されたとき更新バナーが表示される', async ({ page }) => {
    test.skip(
      true,
      'TODO: SW アップデートのシミュレーション方法を確立してから実装する。' +
        '方法候補: ' +
        '1) sw.js をモックした別エンドポイントを用意する ' +
        '2) page.route() で sw.js のレスポンスを差し替える ' +
        '3) アプリの useServiceWorker hook を page.evaluate() で直接呼び出す',
    );

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // SW アップデートをシミュレート
    // TODO: page.route() で /sw.js を新バージョンに差し替えてアップデートをトリガーする
    // await page.route('/sw.js', async (route) => {
    //   await route.fulfill({
    //     status: 200,
    //     contentType: 'application/javascript',
    //     body: '/* updated sw */',
    //   });
    // });

    // アップデートバナーが表示されることを確認
    // TODO: 実際のアップデートバナーのセレクタを確認すること
    const updateBanner = page.locator(
      '[data-testid="sw-update-banner"], [data-testid="update-available"]',
    );
    await expect(updateBanner).toBeVisible({ timeout: 10_000 });
  });

  test('アップデートを適用するとページがリロードされる', async ({ page }) => {
    test.skip(
      true,
      'TODO: SW アップデート適用のシミュレーションを実装してから有効化する。' +
        'page.on("load") イベントをリッスンしてリロードを検出する。',
    );

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // アップデートバナーの「更新」ボタンをクリック
    // TODO: 実際の更新ボタンのセレクタを確認すること
    const updateButton = page.locator(
      '[data-testid="sw-update-button"], button:has-text("更新"), button:has-text("再読み込み")',
    );

    // ページリロードを検知
    const navigationPromise = page.waitForNavigation({ waitUntil: 'load' });
    await updateButton.click();
    await navigationPromise;

    // リロード後もアプリが正常に表示されることを確認
    await expect(page).toHaveTitle(/Dayopt/);
  });

  test('アップデートを適用せずに閉じると次回表示時に再表示される', async ({ page, context }) => {
    test.skip(
      true,
      'TODO: SW アップデートのシミュレーションと「後で」ボタンの実装確認後に実装する。',
    );

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 「後で」ボタンをクリックしてバナーを閉じる
    // TODO: 実際の「後で」ボタンのセレクタを確認すること
    const dismissButton = page.locator(
      '[data-testid="sw-update-dismiss"], button:has-text("後で"), button:has-text("閉じる")',
    );
    await dismissButton.click();

    // バナーが消えたことを確認
    const updateBanner = page.locator('[data-testid="sw-update-banner"]');
    await expect(updateBanner).not.toBeVisible();

    // ページを再訪問（同一ページ）
    await page.reload();
    await page.waitForLoadState('networkidle');

    // TODO: SW が waiting 状態を保持している場合、
    //       再度バナーが表示されることを確認する
    void context; // suppress unused variable warning
  });
});

// ---------------------------------------------------------------------------
// 4. インストールバナー
// ---------------------------------------------------------------------------

test.describe('PWA: インストールバナー', () => {
  /**
   * PWA インストールバナーのテストは、ブラウザが `beforeinstallprompt` イベントを
   * 発火する条件（HTTPS、manifest 有効、未インストール状態など）が揃う必要がある。
   * Playwright では CDP を使って A2HS 条件を手動でトリガーできる。
   */

  test('モバイルビューポートでインストールバナーが表示される', async ({ page }) => {
    test.skip(
      true,
      'TODO: `beforeinstallprompt` イベントのシミュレーション方法を確立する。' +
        '方法候補: ' +
        '1) page.evaluate() で CustomEvent を dispatch する ' +
        '2) Chrome DevTools Protocol (CDP) の override を使用する ' +
        'また、アプリ側でバナーを表示する条件（7日間非表示フラグなど）も確認すること。',
    );

    // モバイルビューポートに設定
    await page.setViewportSize({ width: 390, height: 844 }); // iPhone 14

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // `beforeinstallprompt` イベントをシミュレート
    // TODO: アプリの installPrompt ハンドラの実装に合わせて調整する
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt');
      window.dispatchEvent(event);
    });

    // インストールバナーが表示されることを確認
    // TODO: 実際のインストールバナーのセレクタを確認すること
    const installBanner = page.locator(
      '[data-testid="install-banner"], [data-testid="pwa-install-prompt"]',
    );
    await expect(installBanner).toBeVisible({ timeout: 5_000 });
  });

  test('インストールバナーを閉じると 7 日間再表示されない', async ({ page, context }) => {
    test.skip(
      true,
      'TODO: インストールバナーの非表示フラグ（localStorage/cookie）の ' +
        'キーを確認してから実装する。',
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // TODO: インストールバナーをトリガー
    // TODO: 「閉じる」ボタンをクリック

    // 非表示フラグが localStorage に保存されていることを確認
    // TODO: 実際のキー名を確認すること
    const dismissTimestamp = await page.evaluate(() =>
      localStorage.getItem('pwa-install-dismissed-at'),
    );
    expect(dismissTimestamp).not.toBeNull();

    // 6 日後をシミュレート（localStorage のタイムスタンプを書き換える）
    const sixDaysAgo = Date.now() - 6 * 24 * 60 * 60 * 1_000;
    await page.evaluate((ts) => {
      localStorage.setItem('pwa-install-dismissed-at', String(ts));
    }, sixDaysAgo);

    // ページ再訪問
    await page.reload();
    await page.waitForLoadState('networkidle');

    // 6 日後はまだ表示されない
    const installBanner = page.locator('[data-testid="install-banner"]');
    await expect(installBanner).not.toBeVisible();

    // 8 日後をシミュレート（7 日を超えたので再表示される）
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1_000;
    await page.evaluate((ts) => {
      localStorage.setItem('pwa-install-dismissed-at', String(ts));
    }, eightDaysAgo);

    await page.reload();
    await page.waitForLoadState('networkidle');

    // TODO: 8 日後はバナーが再表示されることを確認
    // await expect(installBanner).toBeVisible({ timeout: 5_000 });

    void context; // suppress unused variable warning
  });

  test('インストール済みのスタンドアロンモードではバナーが表示されない', async ({ page }) => {
    test.skip(
      true,
      'TODO: display-mode: standalone のシミュレーション方法を確認する。' +
        '方法候補: page.emulateMedia() を使用する。',
    );

    // standalone モードをエミュレート
    // TODO: Playwright での display-mode: standalone エミュレーション方法を確認する
    // await page.emulateMedia({ ...? });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // スタンドアロンモードではインストールバナーが表示されないことを確認
    const installBanner = page.locator('[data-testid="install-banner"]');
    await expect(installBanner).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 5. ネットワーク耐性（接続不安定シミュレーション）
// ---------------------------------------------------------------------------

test.describe('PWA: ネットワーク耐性', () => {
  test.skip(!TEST_EMAIL, 'TEST_USER_EMAIL / TEST_USER_PASSWORD が未設定');

  test('低速ネットワーク（Slow 3G）でもアプリが起動する', async ({ context, page }) => {
    test.skip(
      true,
      'TODO: Playwright の CDPSession を使った帯域制限の実装が必要。' +
        'chrome.emulateNetworkConditions を使用する。',
    );

    // Slow 3G をシミュレート
    // TODO: CDPSession で network throttling を設定する
    // const client = await context.newCDPSession(page);
    // await client.send('Network.emulateNetworkConditions', {
    //   offline: false,
    //   downloadThroughput: (500 * 1024) / 8, // 500 Kbps
    //   uploadThroughput: (500 * 1024) / 8,
    //   latency: 400, // 400ms RTT
    // });

    await page.goto('/');
    // タイムアウトを延長して低速ネットワークに対応
    await page.waitForLoadState('networkidle', { timeout: 60_000 });

    await expect(page).toHaveTitle(/Dayopt/);
    void context; // suppress unused variable warning
  });

  test('断続的な接続切断でもデータが失われない', async ({ context, page }) => {
    test.skip(
      true,
      'TODO: 断続的な接続切断のシミュレーションと、' +
        'データ整合性の確認方法（DB との照合）を実装する必要がある。',
    );

    await loginAndNavigateToCalendar(page);

    // 接続を数回切断・復帰させる
    for (let i = 0; i < 3; i++) {
      await context.setOffline(true);
      await page.waitForTimeout(500);
      await context.setOffline(false);
      await page.waitForTimeout(500);
    }

    // アプリが正常に動作していることを確認
    await page.waitForLoadState('networkidle');
    const heading = page.locator('h1, [role="heading"]').first();
    await expect(heading).toBeVisible({ timeout: 15_000 });
  });
});
