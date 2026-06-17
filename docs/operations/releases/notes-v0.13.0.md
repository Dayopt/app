# Release v0.13.0

**リリース日**: 2026-01-23
**バージョン**: 0.13.0

## 概要

タグ機能の親子階層モデル移行、Linear/VS Code風ナビゲーションUI刷新、Lighthouse CIによるパフォーマンス品質ゲート導入、PostHogアナリティクス基盤構築を含む大型リリース。

---

## 変更内容

### ✨ 新機能 (Added)

#### タグ機能の大幅強化 ([#910](https://github.com/t3-nico/dayopt/pull/910))

**データモデル変更**

- タグの親子階層モデルへ移行（`tag_groups` テーブル → `parent_id` カラム）
- 子タグの昇格処理を含むタグマージ機能

**UI/UX改善**

- タグ作成モーダルをポータルで実装（モーダル内でも正常動作）
- カレンダーサイドバーでのタグドラッグ&ドロップ並び替え
- タグ説明文の編集とツールチップ表示
- 未タグ付けフィルターにアイコンと件数表示
- タグ表示をカードの高さ・幅に応じてレスポンシブ化（IntersectionObserver使用）

**楽観的更新**

- タグ作成・編集・削除・マージ・並び替えに楽観的更新を実装
- 階層変更時の即時UI反映

#### ナビゲーション刷新 ([#865](https://github.com/t3-nico/dayopt/pull/865))

- `NavigationTabs` コンポーネント追加（Calendar/Inbox/Stats間のタブ切り替え）
- `CreateNewDropdown` でPlan/Task作成を統一
- サイドバーHeader: NavUser + 検索 + 新規作成ボタン
- サイドバーFooter: 通知 + テーマ切替
- Statsページに専用ヘッダー追加（期間セレクター、AIボタン）
- `usePageTitle` hook + Zustand Store でタイトル動的管理

#### アナリティクス基盤 ([#863](https://github.com/t3-nico/dayopt/pull/863))

- PostHog SDKを導入
- `PostHogProvider` コンポーネントでApp Router対応
- 環境変数未設定時は自動的に無効化（エラーなし）
- ページビュートラッキング実装

#### CI/テスト強化 ([#860](https://github.com/t3-nico/dayopt/pull/860))

**新規CIワークフロー**

- `.github/workflows/coverage.yml` - カバレッジレポート生成
- `.github/workflows/e2e-full-post-merge.yml` - マージ後全ブラウザE2Eテスト
- `.github/workflows/integration.yml` - 統合テスト実行

**新規テスト**

- `TagService` 単体テスト
- Tags統合テスト（API経由のCRUD操作）
- 差分カバレッジスクリプト (`scripts/diff-coverage.mjs`)

**ドキュメント**

- Storybook → Docs/Test Strategy

#### 品質改善パッケージ ([#870](https://github.com/t3-nico/dayopt/pull/870))

**ステータス名変更**

- `done` → `closed` にリネーム（GitHub/Linear標準に統一）
- DBマイグレーションで既存データも移行

**認証エラーハンドリング**

- グローバル認証エラーハンドラー追加
- 認証エラー時の自動リダイレクト（SaaS標準UX）

**CI/CD**

- PR時Lighthouse CI実行
- 週次パフォーマンスレポート自動生成

**その他**

- エラーページ画像のローカル化（外部依存削除）
- Tailwindトークン違反チェッカースクリプト追加

### 🔄 変更 (Changed)

#### Lighthouse CI厳格化 ([#872](https://github.com/t3-nico/dayopt/pull/872))

- PR時もスコア低下でCIブロック（`continue-on-error` 削除）
- Phase 1閾値: Performance 80点、Accessibility 90点、Best Practices 85点
- SEOは警告のみ（認証必須アプリのため）
- 認証フォーム画像に `priority` と `sizes` 属性追加
- 公開プロフィールページ機能を削除（不要機能の整理）

#### ESLint no-consoleルール ([#859](https://github.com/t3-nico/dayopt/pull/859))

- `console.log/info/debug` → エラー（本番コード禁止）
- `console.warn/error` → 許可
- 14ファイルで `console` → `logger` に置換
  - API: middleware, error-handler
  - Components: PreloadResources, error-boundary
  - Features: useSessionMonitor, usePlanRealtime
  - Hooks: useAddPopup
  - Server: recovery-strategies, plans/utils

#### スタイルシステム統一 ([#853](https://github.com/t3-nico/dayopt/pull/853))

**カラー**

- セマンティックカラー透明度トークン統一（Destructive/Accent/Secondary）
- primaryカラー使い分けガイドライン文書化

**ボタンサイズ**

- GAFA準拠の3段階体系に統一
  - `sm`: 32px（Material Design XS相当）
  - `default`: 36px（Material Design Small相当）
  - `lg`: 44px（Apple HIG準拠、タッチターゲット最小サイズ）

#### その他の変更 ([#910](https://github.com/t3-nico/dayopt/pull/910))

**デザインシステム**

- Surfaceシステムを4段階階層に簡素化
- STYLE_GUIDE.md v2.0更新

**国際化**

- カレンダー日付フォーマットに翻訳キー適用
- タグ名前空間を `tag` → `tags` にリネーム
- 繰り返し編集ダイアログに翻訳追加

**URL永続化**

- Inbox: ページネーション、ソート、検索をURLに同期
- Stats: 期間、比較、ヒートマップ年をURLに同期

**削除**

- 旧AppBar/MobileBottomNavigationコンポーネント（-1340行）
- タグアーカイブ機能（使用されていない）
- Tag Inspectorコンポーネント
- `/settings/tags` ページ（サイドバーに統合）

### 🐛 バグ修正 (Fixed)

#### Sentryイベント送信 ([#868](https://github.com/t3-nico/dayopt/pull/868))

- **問題**: `tunnelRoute: '/monitoring-tunnel'` が設定されていたが、ルートハンドラーが自動生成されず、Sentryイベントが失われていた
- **修正**: tunnelRoute設定を削除（CSPヘッダーで既にSentryドメイン許可済み）
- サーバーサイドでランタイム環境変数（SENTRY_DSN, VERCEL_ENV）を優先使用

#### その他の修正 ([#910](https://github.com/t3-nico/dayopt/pull/910))

- タグ名変更後にタグが消える問題を修正
- タグ階層変更時の楽観的更新の不整合を修正
- プラン作成時のタグ同期レースコンディションを修正
- ドラッグ方向に応じたドロップインジケーター表示
- モーダル内でのTooltip位置ずれをポータルで修正
- `merge_tags` 関数の `promoted_count` 累積計算を修正
- `listParentTags` のキャッシュ無効化漏れを修正

### ⚡ パフォーマンス (Performance)

#### 認証フロー最適化 Phase 2 ([#874](https://github.com/t3-nico/dayopt/pull/874))

- Analytics/SpeedInsightsを `requestIdleCallback` で遅延読み込み
- 認証ページでPostHog初期化をスキップ
- 認証ページでCookie同意バナーをスキップ（LCPブロッキング防止）
- ログインページの装飾画像を遅延読み込み

| 最適化項目           | LCP改善 | TBT改善 |
| -------------------- | ------- | ------- |
| Analytics遅延        | -300ms  | -150ms  |
| Cookieバナースキップ | -500ms+ | -       |

#### その他の最適化 ([#910](https://github.com/t3-nico/dayopt/pull/910), [#870](https://github.com/t3-nico/dayopt/pull/870))

- TagListのグループ検索をMapで最適化（O(n) → O(1)）
- SSRプリフェッチとRoute Segment Configで初期ページロード最適化
- PostHog初期化を `useMemo` でメモ化
- フォント軽量化
- CLS改善のためのレイアウト安定化
- `useCallback` 最適化

---

## 関連リンク

### Pull Requests

| PR                                                 | タイトル                                                         | コミット数 |
| -------------------------------------------------- | ---------------------------------------------------------------- | ---------- |
| [#910](https://github.com/t3-nico/dayopt/pull/910) | refactor(tags): タグ機能の改善とリファクタリング                 | 89         |
| [#874](https://github.com/t3-nico/dayopt/pull/874) | perf(auth): Phase 2 - Lighthouse CI optimization                 | 7          |
| [#872](https://github.com/t3-nico/dayopt/pull/872) | ci(lighthouse): enable PR blocking on score regression           | 9          |
| [#870](https://github.com/t3-nico/dayopt/pull/870) | feat: quality improvements - performance, auth, tests, CI/CD     | 13         |
| [#868](https://github.com/t3-nico/dayopt/pull/868) | fix(sentry): tunnelRoute削除によりイベント送信を修正             | 1          |
| [#865](https://github.com/t3-nico/dayopt/pull/865) | refactor(layout): Linear/VS Code風サイドバーとナビゲーション統一 | 9          |
| [#863](https://github.com/t3-nico/dayopt/pull/863) | feat(analytics): PostHog SDK導入                                 | 3          |
| [#860](https://github.com/t3-nico/dayopt/pull/860) | feat(test): テスト戦略強化 - CI/カバレッジ・E2E・Integration     | 7          |
| [#859](https://github.com/t3-nico/dayopt/pull/859) | fix(lint): ESLint no-console ルール追加 & logger統一             | 8          |
| [#853](https://github.com/t3-nico/dayopt/pull/853) | refactor(style): スタイルシステム統一 (カラー・ボタンサイズ)     | 5          |

---

## 破壊的変更 (Breaking Changes)

### データベース

- `tag_groups` テーブルが廃止され、`tags.parent_id` による親子関係に移行
- プランステータス `done` → `closed` にリネーム

### 削除されたコンポーネント

- `AppBar` 関連コンポーネント一式
- `MobileBottomNavigation`, `MoreActionSheet`
- `SidebarHeader`（SidebarShellに統合）
- `TagInspector`
- `/settings/tags` ページ

---

**Full Changelog**: https://github.com/t3-nico/dayopt/compare/v0.12.0...v0.13.0
