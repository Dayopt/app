/**
 * Re-export from lib within feature
 */
export {
  ACTIVITY_TAB_TYPE_MAP,
  checkBrowserNotificationSupport,
  filterNotificationsByTab,
  getDateGroupKey,
  groupNotificationsByDate,
  requestNotificationPermission,
  showBrowserNotification,
} from '../lib/notification-helpers';
export type { ActivityTab, DateGroupKey, GroupedNotifications } from '../lib/notification-helpers';
