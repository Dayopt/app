/**
 * PWA ユーティリティ
 *
 * オフライン同期・バッジ・インストール促進・iOS対応を提供
 */

export { clearAppBadge, isAppBadgeSupported, setAppBadge } from './app-badge';
export {
  canInstall,
  initInstallPrompt,
  isInstalledAsPWA,
  showInstallPrompt,
  subscribeInstallPrompt,
} from './install-prompt';
export {
  isIOSSafari,
  isIOSStandalone,
  patchExternalLinks,
  startSWKeepAlive,
} from './ios-workarounds';
export {
  deduplicateQueue,
  enqueue,
  getPending,
  getPendingCount,
  getAll as getSyncQueue,
  removeEntry,
  subscribe as subscribeSyncQueue,
  updateEntry,
} from './sync-queue';

export { handleOfflineMutationError } from './offline-mutation';
export { initSyncProcessor, processQueue, setSyncExecutor } from './sync-processor';

export type { SyncQueueEntry } from './sync-queue';
