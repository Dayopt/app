/**
 * Settings Feature - Public API
 *
 * ユーザー設定（カレンダー設定、タイムゾーン、日付フォーマットなど）の管理。
 * 内部モジュールへの直接参照（deep import）は避け、ここからのみ import すること。
 */

// =============================================================================
// Types
// =============================================================================
export type { SettingsCategory } from './types';

// =============================================================================
// Constants
// =============================================================================
export { SETTINGS_CATEGORIES } from './constants';

// =============================================================================
// Components (for Composition Layer / routing pages)
// =============================================================================
export { SettingsContent, isValidCategory } from './components/SettingsContent';
export { SettingsDialog } from './components/SettingsDialog';
export { SettingsSidebar } from './components/SettingsSidebar';

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
