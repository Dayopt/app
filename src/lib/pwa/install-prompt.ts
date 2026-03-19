/**
 * PWA インストール促進
 *
 * `beforeinstallprompt` イベントを捕捉し、
 * カスタムインストールバナーを表示するための状態管理。
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeinstallprompt_event
 */

import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** beforeinstallprompt イベント（Chrome/Edge固有） */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

type InstallPromptListener = (canInstall: boolean) => void;

// ---------------------------------------------------------------------------
// 状態
// ---------------------------------------------------------------------------

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let promptListeners: InstallPromptListener[] = [];

/**
 * PWAインストールプロンプトの初期化
 *
 * アプリ起動時に1度だけ呼ぶ。
 * `beforeinstallprompt` イベントをキャプチャし、
 * ユーザーの任意のタイミングでプロンプトを表示可能にする。
 */
export function initInstallPrompt(): () => void {
  if (typeof window === 'undefined') return () => {};

  const handler = (event: Event) => {
    // ブラウザのデフォルトインストールバナーを抑制
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    logger.info('[PWA] Install prompt captured');
    notifyListeners(true);
  };

  window.addEventListener('beforeinstallprompt', handler);

  // すでにインストール済みの場合を検知
  const matchMedia = window.matchMedia?.('(display-mode: standalone)');
  if (matchMedia?.matches) {
    logger.info('[PWA] Already installed as standalone');
  }

  return () => {
    window.removeEventListener('beforeinstallprompt', handler);
  };
}

/**
 * PWAインストールプロンプトを表示
 *
 * @returns ユーザーの選択結果（'accepted' | 'dismissed'）、表示不可の場合は null
 */
export async function showInstallPrompt(): Promise<'accepted' | 'dismissed' | null> {
  if (!deferredPrompt) {
    logger.warn('[PWA] No install prompt available');
    return null;
  }

  try {
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    logger.info(`[PWA] Install prompt outcome: ${outcome}`);

    // 使い捨て — 再利用不可
    deferredPrompt = null;
    notifyListeners(false);

    return outcome;
  } catch (error) {
    logger.error('[PWA] Install prompt failed:', error);
    return null;
  }
}

/**
 * インストール可能かどうか
 */
export function canInstall(): boolean {
  return deferredPrompt !== null;
}

/**
 * PWAとしてインストール済みか
 */
export function isInstalledAsPWA(): boolean {
  if (typeof window === 'undefined') return false;

  // standalone モードで起動しているか
  const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches;

  // iOS Safari の navigator.standalone
  const isIOSStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;

  return isStandalone || isIOSStandalone;
}

/**
 * インストール状態の変更を購読
 */
export function subscribeInstallPrompt(listener: InstallPromptListener): () => void {
  promptListeners.push(listener);
  return () => {
    promptListeners = promptListeners.filter((fn) => fn !== listener);
  };
}

function notifyListeners(canInstallNow: boolean): void {
  promptListeners.forEach((fn) => fn(canInstallNow));
}
