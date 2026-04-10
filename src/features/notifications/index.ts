/**
 * Notifications Feature - Public API
 *
 * 通知機能（ブラウザ通知、アプリ内通知）のエントリポイント。
 * 内部モジュールへの直接参照（deep import）は避け、ここからのみ import すること。
 */

// =============================================================================
// Components
// =============================================================================
export { ActivityContent } from './components/ActivityContent';
export { ActivityPopover } from './components/ActivityPopover';
export { NotificationItem } from './components/NotificationItem';

// =============================================================================
// Hooks
// =============================================================================
export { useNotifications } from './hooks/useNotifications';
export {
  useNotificationMutations,
  useNotificationsList,
  useUnreadCount,
} from './hooks/useNotificationsData';

// =============================================================================
// Types
// =============================================================================
export type { ActivityTab } from './utils/notification-helpers';
