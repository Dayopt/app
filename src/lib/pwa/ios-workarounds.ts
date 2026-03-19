/**
 * iOS PWA 固有の制約への対応
 *
 * - Safari SWの7日キャッシュ制限: 定期的なSW ping でキャッシュ維持
 * - standalone モードでのナビゲーション制御
 * - iOS 固有の viewport 問題
 */

import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// iOS 判定
// ---------------------------------------------------------------------------

/** iOS Safari かどうか */
export function isIOSSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document);
}

/** iOS PWA（standalone mode）かどうか */
export function isIOSStandalone(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

// ---------------------------------------------------------------------------
// SW キャッシュ維持（7日制限対策）
// ---------------------------------------------------------------------------

const SW_PING_INTERVAL = 3 * 24 * 60 * 60 * 1000; // 3日ごと
const SW_PING_KEY = 'dayopt-sw-last-ping';

/**
 * Service Worker を定期的に ping してキャッシュの有効期限を延長
 *
 * iOS Safari では非アクティブなSWのキャッシュが7日で失効するため、
 * 定期的にSWにメッセージを送信してアクティブ状態を維持する。
 */
export function startSWKeepAlive(): () => void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return () => {};
  }

  // iOS以外では不要
  if (!isIOSSafari()) {
    return () => {};
  }

  const ping = async () => {
    try {
      const lastPing = localStorage.getItem(SW_PING_KEY);
      const now = Date.now();

      if (lastPing && now - Number(lastPing) < SW_PING_INTERVAL) {
        return; // まだping不要
      }

      const registration = await navigator.serviceWorker.ready;
      registration.active?.postMessage({ type: 'KEEP_ALIVE' });
      localStorage.setItem(SW_PING_KEY, String(now));
      logger.info('[iOS] SW keep-alive ping sent');
    } catch (error) {
      logger.warn('[iOS] SW keep-alive failed:', error);
    }
  };

  // 初回 ping
  ping();

  // visibilitychange でアプリ復帰時にもping
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      ping();
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);

  // 定期ping（3日ごと）
  const intervalId = setInterval(ping, SW_PING_INTERVAL);

  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    clearInterval(intervalId);
  };
}

// ---------------------------------------------------------------------------
// standalone ナビゲーション制御（バック操作ガード）
// ---------------------------------------------------------------------------

/**
 * iOS standalone モードでの誤ったバック操作によるアプリ離脱を防止
 *
 * iOS PWA にはネイティブの「戻る」ボタンが存在しないため、
 * スワイプバック（edge-swipe）や popstate によってアプリが
 * Safari に戻ってしまうケースを防ぐ。
 *
 * 対策:
 * - 初期ロード時に history エントリをスタックに積む（sentinel）
 * - `popstate` で履歴の先頭に戻ろうとした場合は `history.pushState` で押し戻す
 */
export function preventStandaloneNavLoss(): () => void {
  if (typeof window === 'undefined' || !isIOSStandalone()) {
    return () => {};
  }

  // sentinel エントリを積んで、戻れる場所を作る
  history.pushState({ iosStandaloneSentinel: true }, '');

  const handlePopState = (event: PopStateEvent) => {
    // sentinel まで戻ってきた = これ以上後退するとアプリを離脱する
    if (!event.state || event.state.iosStandaloneSentinel) {
      // sentinel を再度積み直してアプリ内に留まらせる
      history.pushState({ iosStandaloneSentinel: true }, '');
      logger.info('[iOS] Prevented standalone nav loss via popstate');
    }
  };

  window.addEventListener('popstate', handlePopState);

  return () => {
    window.removeEventListener('popstate', handlePopState);
  };
}

// ---------------------------------------------------------------------------
// viewport height 修正（iOS Safari アドレスバー問題）
// ---------------------------------------------------------------------------

/**
 * iOS Safari の `100vh` バグを `--vh` CSS カスタムプロパティで修正
 *
 * iOS Safari ではアドレスバーが表示/非表示になると `window.innerHeight` が
 * 変化するが、CSS の `100vh` は最大ビューポート高さを参照し続けるため、
 * コンテンツが見切れる問題が発生する。
 *
 * `--vh` を `window.innerHeight * 0.01` に設定し、
 * CSS 側では `height: calc(var(--vh, 1vh) * 100)` として使う。
 *
 * @example
 * ```css
 * .full-height {
 *   height: calc(var(--vh, 1vh) * 100);
 * }
 * ```
 */
export function fixIOSViewportHeight(): () => void {
  if (typeof window === 'undefined' || !isIOSSafari()) {
    return () => {};
  }

  const setVH = () => {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
  };

  // 初回設定
  setVH();

  window.addEventListener('resize', setVH);

  // iOS Safari ではページ表示時にも再設定（アドレスバー変化への追従）
  window.addEventListener('orientationchange', setVH);

  return () => {
    window.removeEventListener('resize', setVH);
    window.removeEventListener('orientationchange', setVH);
  };
}

// ---------------------------------------------------------------------------
// standalone ナビゲーション制御（外部リンク）
// ---------------------------------------------------------------------------

/**
 * iOS standalone モードでの外部リンクを in-app ブラウザで開く
 *
 * iOS PWA ではリンクをタップすると Safari に飛ばされるため、
 * 外部リンクに `target="_blank"` を自動付与する。
 */
export function patchExternalLinks(): () => void {
  if (typeof document === 'undefined' || !isIOSStandalone()) {
    return () => {};
  }

  const handler = (event: MouseEvent) => {
    const target = (event.target as HTMLElement).closest('a');
    if (!target) return;

    const href = target.getAttribute('href');
    if (!href) return;

    // 外部リンクの判定
    const isExternal = href.startsWith('http') && !href.startsWith(window.location.origin);

    if (isExternal) {
      event.preventDefault();
      window.open(href, '_blank', 'noopener,noreferrer');
    }
  };

  document.addEventListener('click', handler);
  return () => document.removeEventListener('click', handler);
}
