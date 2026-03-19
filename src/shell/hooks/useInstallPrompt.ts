'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';

import {
  canInstall,
  initInstallPrompt,
  isInstalledAsPWA,
  showInstallPrompt,
  subscribeInstallPrompt,
} from '@/lib/pwa/install-prompt';
import { isIOSSafari, isIOSStandalone } from '@/lib/pwa/ios-workarounds';

const DISMISS_KEY = 'dayopt-install-banner-dismissed';
const DISMISS_DURATION = 7 * 24 * 60 * 60 * 1000; // 7日間

const IOS_GUIDE_DISMISS_KEY = 'dayopt-ios-install-guide-dismissed';

export interface UseInstallPromptResult {
  /** インストール可能か（Android / Chrome 系のみ true） */
  canPrompt: boolean;
  /** すでにPWAとしてインストール済みか */
  isInstalled: boolean;
  /** バナーを表示すべきか（dismiss考慮） */
  shouldShowBanner: boolean;
  /** インストールプロンプトを表示 */
  promptInstall: () => Promise<void>;
  /** バナーを閉じる（7日間非表示） */
  dismissBanner: () => void;
  /** iOS Safari かどうか */
  isIOS: boolean;
  /** iOS インストールガイドを表示すべきか */
  shouldShowIOSGuide: boolean;
  /** iOS インストールガイドを閉じる（7日間非表示） */
  dismissIOSGuide: () => void;
}

// ---------------------------------------------------------------------------
// 外部ストアとしてのインストール状態管理
// ---------------------------------------------------------------------------

let dismissedUntil = 0;
let dismissListeners: Array<() => void> = [];

function getDismissedSnapshot(): boolean {
  return Date.now() < dismissedUntil;
}

function getServerDismissedSnapshot(): boolean {
  return true; // SSR時は常に非表示
}

function subscribeDismiss(callback: () => void): () => void {
  dismissListeners.push(callback);
  return () => {
    dismissListeners = dismissListeners.filter((fn) => fn !== callback);
  };
}

function notifyDismissListeners(): void {
  dismissListeners.forEach((fn) => fn());
}

// ---------------------------------------------------------------------------
// iOS インストールガイド dismiss 状態管理
// ---------------------------------------------------------------------------

let iosGuideDismissedUntil = 0;
let iosGuideDismissListeners: Array<() => void> = [];

function getIOSGuideDismissedSnapshot(): boolean {
  return Date.now() < iosGuideDismissedUntil;
}

function getServerIOSGuideDismissedSnapshot(): boolean {
  return true; // SSR時は常に非表示
}

function subscribeIOSGuideDismiss(callback: () => void): () => void {
  iosGuideDismissListeners.push(callback);
  return () => {
    iosGuideDismissListeners = iosGuideDismissListeners.filter((fn) => fn !== callback);
  };
}

function notifyIOSGuideDismissListeners(): void {
  iosGuideDismissListeners.forEach((fn) => fn());
}

// 初期化（クライアントのみ）
if (typeof window !== 'undefined') {
  const stored = localStorage.getItem(DISMISS_KEY);
  if (stored) {
    const ts = Number(stored);
    if (Date.now() - ts < DISMISS_DURATION) {
      dismissedUntil = ts + DISMISS_DURATION;
    }
  }

  const iosStored = localStorage.getItem(IOS_GUIDE_DISMISS_KEY);
  if (iosStored) {
    const ts = Number(iosStored);
    if (Date.now() - ts < DISMISS_DURATION) {
      iosGuideDismissedUntil = ts + DISMISS_DURATION;
    }
  }
}

/**
 * PWA インストール促進フック
 *
 * Android / Chrome 系では `beforeinstallprompt` ベースのバナー、
 * iOS Safari では手順ガイド（IOSInstallGuide）を使い分ける。
 *
 * @example
 * ```tsx
 * const { shouldShowBanner, shouldShowIOSGuide, promptInstall, dismissBanner, dismissIOSGuide } = useInstallPrompt()
 *
 * if (shouldShowBanner) {
 *   return <InstallBanner onInstall={promptInstall} onDismiss={dismissBanner} />
 * }
 * if (shouldShowIOSGuide) {
 *   return <IOSInstallGuide onDismiss={dismissIOSGuide} />
 * }
 * ```
 */
export function useInstallPrompt(): UseInstallPromptResult {
  const canPromptNow = useSyncExternalStore(subscribeInstallPrompt, canInstall, () => false);

  const isDismissed = useSyncExternalStore(
    subscribeDismiss,
    getDismissedSnapshot,
    getServerDismissedSnapshot,
  );

  const isIOSGuideDismissed = useSyncExternalStore(
    subscribeIOSGuideDismiss,
    getIOSGuideDismissedSnapshot,
    getServerIOSGuideDismissedSnapshot,
  );

  const isInstalled = isInstalledAsPWA();

  // iOS 判定はクライアントのみ（SSRでは false）
  const isIOS = typeof window !== 'undefined' ? isIOSSafari() : false;
  const isStandalone = typeof window !== 'undefined' ? isIOSStandalone() : false;

  // beforeinstallprompt イベントのキャプチャ（iOS では発火しないが副作用なし）
  useEffect(() => {
    const cleanup = initInstallPrompt();
    return cleanup;
  }, []);

  const promptInstall = useCallback(async () => {
    await showInstallPrompt();
  }, []);

  const dismissBanner = useCallback(() => {
    const now = Date.now();
    dismissedUntil = now + DISMISS_DURATION;
    localStorage.setItem(DISMISS_KEY, String(now));
    notifyDismissListeners();
  }, []);

  const dismissIOSGuide = useCallback(() => {
    const now = Date.now();
    iosGuideDismissedUntil = now + DISMISS_DURATION;
    localStorage.setItem(IOS_GUIDE_DISMISS_KEY, String(now));
    notifyIOSGuideDismissListeners();
  }, []);

  return {
    canPrompt: canPromptNow,
    isInstalled,
    shouldShowBanner: canPromptNow && !isInstalled && !isDismissed,
    promptInstall,
    dismissBanner,
    isIOS,
    // iOS Safari かつ standalone でなく（未インストール）かつ未 dismiss の場合のみ表示
    shouldShowIOSGuide: isIOS && !isStandalone && !isIOSGuideDismissed,
    dismissIOSGuide,
  };
}
