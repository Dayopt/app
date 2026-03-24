/**
 * Notifications Feature - Public API
 *
 * 通知機能（ブラウザ通知、アプリ内通知）のエントリポイント。
 * 内部モジュールへの直接参照（deep import）は避け、ここからのみ import すること。
 */

// =============================================================================
// Components
// =============================================================================
export { NotificationDropdown } from './components/NotificationDropdown';
export { NotificationItem } from './components/NotificationItem';

// =============================================================================
// Hooks
// =============================================================================
export { useNotificationPreferences } from './hooks/useNotificationPreferences';
export { useNotifications } from './hooks/useNotifications';

// =============================================================================
// Types
// =============================================================================
export type { Notification, NotificationEntity, NotificationType } from './types';

// =============================================================================
// Utils
// =============================================================================
export {
  checkBrowserNotificationSupport,
  getDateGroupKey,
  groupNotificationsByDate,
  requestNotificationPermission,
  showBrowserNotification,
} from './utils/notification-helpers';
export type { DateGroupKey, GroupedNotifications } from './utils/notification-helpers';

// =============================================================================
// Transformers
// =============================================================================
export { transformNotificationEntities, transformNotificationEntity } from './lib/transformers';
