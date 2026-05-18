# PWA E2E テスト

`offline-sync.spec.ts` は PWA のオフライン対応と同期フローを検証する E2E テストのスケルトンです。
テスト構造と TODO コメントを定義しており、実インフラが揃い次第 `test.skip()` を外して実装します。

---

## ファイル構成

```
src/test/e2e/pwa/
├── offline-sync.spec.ts   # PWA オフライン/同期テスト（このファイル）
└── README.md              # このファイル
```

---

## 実行方法

### 前提条件

| 条件             | 詳細                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------- |
| ビルド済みアプリ | Service Worker は `next start`（本番ビルド）でのみ有効。`next dev` では SW が登録されない |
| 認証情報         | `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` 環境変数を設定すること                           |
| ブラウザ         | Chromium のみ（PWA API の対応状況による）                                                 |

### 環境変数の設定

```bash
export TEST_USER_EMAIL=your-test-user@example.com
export TEST_USER_PASSWORD=your-test-password
```

### テスト実行コマンド

```bash
# すべての E2E テストを実行
npm run test:e2e

# PWA テストのみを実行
npx playwright test src/test/e2e/pwa/offline-sync.spec.ts

# ヘッドありモードで実行（デバッグ用）
npx playwright test src/test/e2e/pwa/offline-sync.spec.ts --headed

# Playwright UI モードで実行（ステップ確認用）
npx playwright test src/test/e2e/pwa/offline-sync.spec.ts --ui

# 特定の describe ブロックのみ実行
npx playwright test src/test/e2e/pwa/offline-sync.spec.ts --grep "PWA: インストール要件"
```

### 本番ビルドでの起動

```bash
npm run build
npm run start
# 別ターミナルで:
npx playwright test src/test/e2e/pwa/offline-sync.spec.ts
```

---

## テスト構成

### 1. PWA インストール要件 (`PWA: インストール要件`)

| テスト                  | 状態         | 説明                                         |
| ----------------------- | ------------ | -------------------------------------------- |
| 有効な Web App Manifest | **実装済み** | manifest.json の必須フィールド検証           |
| Service Worker 登録     | **実装済み** | 本番ビルド限定で SW 登録を確認               |
| オフラインページ表示    | **実装済み** | オフライン時の `/offline` フォールバック確認 |

### 2. オフライン→オンライン同期フロー (`PWA: オフライン→オンライン同期フロー`)

| テスト                                         | 状態     | 説明                                            |
| ---------------------------------------------- | -------- | ----------------------------------------------- |
| オフライン中エントリ作成→キュー保存            | **TODO** | IndexedDB のキースキーマ確定後に実装            |
| オンライン復帰後の同期                         | **TODO** | Supabase との結合テスト（ステージング環境必要） |
| オフラインミューテーションが失敗扱いにならない | **TODO** | TanStack Query pauseMutations の動作確認後      |
| 同期インジケータの表示                         | **TODO** | 同期中 UI の実装確認後                          |

### 3. Service Worker アップデート (`PWA: Service Worker アップデート`)

| テスト                            | 状態     | 説明                                        |
| --------------------------------- | -------- | ------------------------------------------- |
| SW アップデート検出 → バナー表示  | **TODO** | SW アップデートのシミュレーション方法確立後 |
| アップデート適用 → ページリロード | **TODO** | 更新ボタンのセレクタ確認後                  |
| 閉じる → 次回再表示               | **TODO** | 「後で」ボタンの実装確認後                  |

### 4. インストールバナー (`PWA: インストールバナー`)

| テスト                         | 状態     | 説明                                             |
| ------------------------------ | -------- | ------------------------------------------------ |
| モバイルでバナー表示           | **TODO** | `beforeinstallprompt` シミュレーション方法確立後 |
| 閉じると 7 日間非表示          | **TODO** | localStorage キー名確認後                        |
| スタンドアロンモードでは非表示 | **TODO** | display-mode エミュレーション方法確認後          |

### 5. ネットワーク耐性 (`PWA: ネットワーク耐性`)

| テスト                   | 状態     | 説明                         |
| ------------------------ | -------- | ---------------------------- |
| Slow 3G でアプリ起動     | **TODO** | CDP の帯域制限実装後         |
| 断続的切断でデータ不損失 | **TODO** | データ整合性確認方法の設計後 |

---

## TODO 一覧（実装前に確認が必要な項目）

### インフラ・設定

- [ ] `IDB_DATABASE_NAME`: TanStack Query Persist アダプタの実際の IndexedDB DB 名を確認
  - DevTools > Application > IndexedDB で確認
- [ ] `readOfflineQueue()`: IndexedDB のキースキーマ（ストア名・キー構造）を確認してから実装
- [ ] Service Worker が本番ビルドで正しく登録されることを手動確認

### セレクタ

- [ ] オフラインインジケータ: `[data-testid="offline-indicator"]` の実装有無
- [ ] エントリ作成ボタン: `[data-testid="create-entry"]` の実装有無
- [ ] Inspector タイトル入力: `[data-testid="entry-title-input"]` の実装有無
- [ ] エントリカード: `[data-testid="entry-card"]` の実装有無
- [ ] SW 更新バナー: `[data-testid="sw-update-banner"]` の実装有無
- [ ] インストールバナー: `[data-testid="install-banner"]` の実装有無
- [ ] 同期インジケータ: `[data-testid="sync-indicator"]` の実装有無

### localStorage キー

- [ ] PWA インストール非表示フラグのキー名を確認
  - 現在の仮のキー: `pwa-install-dismissed-at`
  - 実際のキーは `useServiceWorker.ts` または関連 hook を参照

---

## 注意事項

### Service Worker と開発サーバー

`next dev` は Service Worker をサポートしていません。SW 関連テストは必ず `next build && next start` で起動したアプリに対して実行してください。

### テストデータのクリーンアップ

同期フローテスト（セクション 2）は Supabase に実際のエントリを書き込みます。テスト専用ユーザーを使用し、テスト後はデータをクリーンアップしてください。

### Playwright Config との関係

このテストは `playwright.config.ts` の `testDir: './src/test/e2e'` に含まれており、`npm run test:e2e` で自動的に検出されます。

### `context.setOffline()` の制限

`context.setOffline(true)` は Chromium のネットワーク層でオフラインをシミュレートします。
Service Worker のキャッシュは通常どおり動作しますが、`fetch()` リクエストはすべて失敗します。
WebSocket 接続（Supabase リアルタイム）も切断されます。
