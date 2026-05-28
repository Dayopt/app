/**
 * Settings Feature - Public API
 *
 * ユーザー設定（カレンダー設定、タイムゾーン、日付フォーマットなど）の管理。
 * 内部モジュールへの直接参照（deep import）は避け、ここからのみ import すること。
 *
 * ## このfeatureは通常featureではなく cross-cutting composition
 *
 * - ESLint feature DAG から除外されている（`apps/product/eslint.config.mjs` 参照）
 * - 他 feature の store を deep import するのは composition の責務として許容される例外運用
 *   （優先順: `@/lib/stores/*` > feature barrel > deep import）
 * - 自身の domain は持たない（business rule は calendar / chronotype / billing 等が持つ）
 * - `userSettingsRouter` / `billingRouter` は settings UI からの書き込み入口として
 *   server を同居（billing は launch 後に独立 feature 化を検討）
 *
 * 詳細: `.claude/rules/feature-boundaries.md` の Composition Feature セクション
 */

// =============================================================================
// Constants
// =============================================================================
export { SETTINGS_CATEGORIES } from './constants';

// =============================================================================
// Components (for Composition Layer / routing pages)
// =============================================================================
export { SettingsContent, isValidCategory } from './components/SettingsContent';
export { UserSettingsInitializer } from './components/UserSettingsInitializer';

// =============================================================================
// Hooks
// =============================================================================
export { usePaymentErrorDialog } from './hooks/usePaymentErrorDialog';
export { useTrialEndedDialog } from './hooks/useTrialEndedDialog';
export { useUserSettings } from './hooks/useUserSettings';

// =============================================================================
// Dialogs
// =============================================================================
export { PaymentErrorDialog } from './components/PaymentErrorDialog';
export { TrialEndedDialog } from './components/TrialEndedDialog';

// =============================================================================
// Utils
// =============================================================================
// Note: getCurrentTimezone / setUserTimezone は削除済み。
// タイムゾーンの取得は Zustand ストア (useCalendarSettingsStore) を使用すること。
// ブラウザTZの検出には getBrowserTimezone from '@/lib/date' を使用。

// ここにないものはfeature内部専用
