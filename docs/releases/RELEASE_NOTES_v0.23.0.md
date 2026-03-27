# Release v0.23.0

**リリース日**: 2026-03-27
**バージョン**: 0.23.0

## 概要

モバイルUI刷新、Chronotype機能の大幅リデザイン（deep/ease体系への移行）、デザイントークン体系の刷新、タイムゾーン対応の全面修正、メール全テンプレートのi18n対応、通知機能の強化、plan/record用語のentry統一を含む大型リリース。

---

## 変更内容

### ✨ 新機能 (Added)

#### モバイルUI刷新 + カレンダーリファクタリング ([#1017](https://github.com/Dayopt/app/pull/1017))

- モバイル専用レイアウトの改善（ヘッダー固定、ボトムナビ調整）
- 隣接予定の重複誤検出修正
- コンテキストメニューのモバイル対応
- お問い合わせをモバイルではDrawer（ボトムシート）表示に変更
- タイムライン長押しによるエントリー作成のタッチヒント追加

#### タグアイコン機能 ([#1017](https://github.com/Dayopt/app/pull/1017))

- タグにアイコンを設定可能に（48個の厳選アイコン）
- IconPickerコンポーネント（8列グリッド）
- タグUIのグリッド4列化

#### メールi18n対応 ([#1022](https://github.com/Dayopt/app/pull/1022))

- 全15メールテンプレートを日英バイリンガル対応
- `createEmailTranslator(locale)` ファクトリー関数（react-email環境でnext-intlが使えないため独自実装）
- `user_settings` に `preferred_locale` カラム追加
- 通知設定UIにメール言語セレクター追加
- 3つの送信パス（Auth / Transactional / Edge Function）すべてにlocale伝播

#### 通知機能の強化 ([#1022](https://github.com/Dayopt/app/pull/1022))

**daily-insights Edge Function**

- ルールベースのプッシュ通知（KPI閾値判定）
  - エントリー率 < 0.5、コンテキストスイッチ > 8、空白率 > 0.6
  - バーンアウト検出（3日連続10h超 or 充実度 < 2.0）
- ユーザー別の通知タイプ設定（`enable_daily_insights` / `enable_energy_insights` / `enable_burnout_warnings` / `enable_weekly_reports`）
- 重複チェック付き通知挿入

**ActivityPopover**

- Slack風ポップオーバー（Bell + 未読バッジ）
- タブフィルタ（All / Reminders / AI）
- 設定ギアボタンから通知設定へ直接遷移

#### Storybook Docs全面刷新 ([#1022](https://github.com/Dayopt/app/pull/1022))

- カラードキュメント全面刷新 + StyleGuide廃止
- Foundations Overviewページ新設
- Elevation を4段階（sunken/base/raised/overlay）に再構成
- タイムゾーン設計ガイド（Docs/Architecture）追加
- トークン一覧Overviewストーリー追加

### 🔄 変更 (Changed)

#### Chronotype機能リデザイン ([#1022](https://github.com/Dayopt/app/pull/1022))

**用語変更**

- `peak` / `dip` → `deep` / `ease` に統一
- 5フェーズ（warmup/peak/dip/recovery/winddown）→ 2フェーズ（deep/ease）に簡素化

**グラデーション**

- `generateChronotypeGradient(zones, mode)` — oklch smoothstep fade-in/flat-top/fade-out
- DBにグラデーションキャッシュ保存（`chronotypeGradient.light/dark`）
- 旧 `ChronotypeBackground` コンポーネント削除

**Now Line**

- dot 6px + bar 2px のリデザイン
- `NowBadge` 追加（deep/easeゾーン内で「↗ In Deep Focus」等を表示）

**カラートークン**

- 旧 `chronotype-warmup/peak/dip/recovery/winddown` → `chronotype-deep` / `chronotype-ease` / `chronotype-deep-tint` / `chronotype-ease-tint`

#### デザイントークン体系の刷新 ([#1022](https://github.com/Dayopt/app/pull/1022))

- opacity派生トークン全廃 → named tint/scale/stateトークンに統一
- `surface-inset` 廃止 → `bg-muted` に移行（26箇所）
- 物理ライティングシステム（`--elevation-*`、glassmorphismトークン）削除
- セマンティックtintトークン追加（`destructive-tint`, `warning-tint`, `success-tint`, `info-tint`, `border-subtle`）
- ヒートマップスケールカラー追加
- `shadow-*` をTailwind標準クラスに統一（独自surface-\*ユーティリティ廃止）

#### タイムゾーン対応の全面修正 ([#1022](https://github.com/Dayopt/app/pull/1022))

**DB関数**

- 9つの統計RPC関数を `AT TIME ZONE 'UTC'` → `public.get_user_timezone(p_user_id)` に修正
- インデックス最適化（WHERE句をインデックス活用可能に）
- `week_starts_on` サポート追加

**クライアント**

- SSR Cookie方式のTZ検出導入
- TZ変更時キャッシュ無効化
- 8つのTZ境界ヘルパー追加（`tzDayStart`, `tzWeekStart`, `tzMonthStart` 等）
- `getUserTimezone` → `getBrowserTimezone` にリネーム

**修正箇所**

- 統計、ストリーク、AI文脈、月次トレンド、キーボードペースト、日付フィルタ、prefetch/クエリの計7箇所のTZずれを修正

#### plan/record → entry 用語統一 ([#1022](https://github.com/Dayopt/app/pull/1022))

- `plan.json` を `entry.json` にマージ（en/ja両方）
- 全コンポーネント・フック・テストのi18nキーを `plan.*` → `entry.*` に移行
- `formatplanDate` / `formatplanDateTime` / `formatplanNumber` → `formatEntryDate` / `formatEntryDateTime` / `formatEntryNumber`
- `usePlanOperations` → `useEntryOperations`
- `SamplePlanTemplate` → `SampleEntryTemplate`

#### Zustand Store統合 ([#1022](https://github.com/Dayopt/app/pull/1022))

- `useShellStore` に5ストアを統合（`useLayoutStore`, `usePageTitleStore`, `useMobileCreateSheetStore`, `useContactStore`, `useSettingsStore`）
- `calendarNavigationStore` を一方向コマンドチャネルに整理
- `entryInspectorStore` の `anchorRect` をmodule-scoped refに移動
- 不要ストア3つ削除（onboarding, tagCache等）

#### スタイル最適化 ([#1022](https://github.com/Dayopt/app/pull/1022))

- tw-animate-css導入で手書きアニメーション約190行を削除
- arbitrary values・インラインstyleをTailwind標準に置換
- 子コンポーネントの冗長な `bg-background` 削除
- `field-sizing-content` で手書きauto-resize JS約25行を削除
- オーバーレイに `backdrop-blur-md` 追加 + Popover/Dropdownにlayered shadow適用

### 🐛 バグ修正 (Fixed)

#### a11y修正 ([#1022](https://github.com/Dayopt/app/pull/1022))

- Chronotype Switchに `aria-label` 追加
- Timeline labelに `aria-hidden` 追加
- axe-core違反修正（role/group、listitem親、ラベル欠落）
- Destructive色のコントラスト修正
- オーバーレイ閉じアニメーション中のクリック貫通防止

#### グローバル対応修正 ([#1022](https://github.com/Dayopt/app/pull/1022))

- デフォルトtimezoneを自動検出に変更（`Asia/Tokyo` ハードコード排除）
- dateFormatをISO 8601（`yyyy-MM-dd`）に変更
- `weekStartsOn` をユーザー設定に統一（Monday ハードコード排除）
- 料金表示の `$` ハードコードを `Intl.NumberFormat` に置換

#### Supabase修正 ([#1022](https://github.com/Dayopt/app/pull/1022))

- Security advisor警告の一括修正
- Performance advisor警告の修正

#### その他 ([#1022](https://github.com/Dayopt/app/pull/1022))

- Stats: `hasNoData` がエラー・フェッチ中を無視して空状態を表示するバグ修正
- Stats: `useStatsFilterSync` の `useEffect` 無限ループとURLパラメータ消失修正
- Layout: `useSearchParams` を `BaseLayoutContent` から除去しSuspenseアンマウント防止
- Sidebar: タグ作成ボタンをパレットと同じ Button ghost に統一

### ⚡ パフォーマンス (Performance)

- 統計関数のWHERE句をインデックス活用可能に最適化

### 破壊的変更 (Breaking Changes)

**データベース**

- `user_settings` に `preferred_locale` カラム追加
- 統計RPC関数9つの引数にタイムゾーン対応追加
- `notification_preferences` に4つの通知タイプカラム追加
- Chronotypeグラデーションキャッシュ用スキーマ追加

**削除されたコンポーネント・ストア**

- `ChronotypeBackground` コンポーネント（-67行）
- `NotificationDropdown` → `ActivityPopover` に置換
- `useLayoutStore`, `useSettingsStore`, `usePageTitleStore`, `useMobileCreateSheetStore`, `useContactStore` → `useShellStore` に統合
- `useOnboardingStore`, `useTagCacheStore` 削除

**削除されたファイル**

- `messages/*/plan.json`（`entry.json` にマージ）
- `src/features/settings/utils/timezone.ts`（`src/lib/date/timezone.ts` に統合）
- `src/lib/timezone-listener.ts`
- 旧Storybook docs（ColorSystem, CommonPatterns, DesignPrinciples, Overview, Rules）

**CSSトークン**

- `--elevation-*` トークン削除
- `surface-sunken/flat/raised/raised-heavy` ユーティリティ削除
- `glass-light/medium/heavy` ユーティリティ削除
- Chronotype旧カラートークン（warmup/peak/dip/recovery/winddown）削除

**i18nキー**

- `plan.*` 名前空間廃止 → `entry.*` に統一
- `entry.toast.restored` / `restoreFailed` / `conflict` は `entry.json` に移行済み

---

## 関連リンク

### Pull Requests

| PR                                               | タイトル                                                   | 概要                     |
| ------------------------------------------------ | ---------------------------------------------------------- | ------------------------ |
| [#1017](https://github.com/Dayopt/app/pull/1017) | モバイルUI刷新 + カレンダーリファクタリング + タグアイコン | モバイル体験の大幅改善   |
| [#1022](https://github.com/Dayopt/app/pull/1022) | v0.23.0                                                    | リリースブランチの統合PR |

---

**Full Changelog**: https://github.com/Dayopt/app/compare/v0.22.0...v0.23.0
