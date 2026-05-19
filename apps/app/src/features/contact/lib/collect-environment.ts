/**
 * ブラウザ環境情報を自動収集
 *
 * navigator.userAgent から OS・ブラウザを検出し、
 * タイムゾーン・言語とともに返す。
 */

import type { ContactEnvironment } from '../types';

/** OS を UA 文字列から検出 */
function detectOS(ua: string): string {
  // iOS は "Mac OS X" を含む UA もあるため先にチェック
  if (ua.includes('iPhone') || ua.includes('iPad')) {
    const match = ua.match(/OS ([\d_]+)/);
    return `iOS ${match?.[1]?.replace(/_/g, '.') ?? ''}`.trim();
  }
  if (ua.includes('Mac OS X')) {
    const match = ua.match(/Mac OS X ([\d_]+)/);
    return `macOS ${match?.[1]?.replace(/_/g, '.') ?? ''}`.trim();
  }
  if (ua.includes('Windows NT')) {
    const match = ua.match(/Windows NT ([\d.]+)/);
    return `Windows ${match?.[1] ?? ''}`.trim();
  }
  if (ua.includes('Android')) {
    const match = ua.match(/Android ([\d.]+)/);
    return `Android ${match?.[1] ?? ''}`.trim();
  }
  if (ua.includes('Linux')) {
    return 'Linux';
  }
  return 'Unknown';
}

/** ブラウザを UA 文字列から検出 */
function detectBrowser(ua: string): string {
  if (ua.includes('Edg')) {
    const match = ua.match(/Edg\/([\d.]+)/);
    return `Edge ${match?.[1] ?? ''}`.trim();
  }
  if (ua.includes('Chrome')) {
    const match = ua.match(/Chrome\/([\d.]+)/);
    return `Chrome ${match?.[1] ?? ''}`.trim();
  }
  if (ua.includes('Firefox')) {
    const match = ua.match(/Firefox\/([\d.]+)/);
    return `Firefox ${match?.[1] ?? ''}`.trim();
  }
  if (ua.includes('Safari')) {
    const match = ua.match(/Version\/([\d.]+)/);
    return `Safari ${match?.[1] ?? ''}`.trim();
  }
  return 'Unknown';
}

/**
 * ブラウザ環境情報を収集してお問い合わせに添付するデータを返す
 * @param appVersion - アプリのバージョン文字列
 */
export function collectEnvironment(appVersion: string): ContactEnvironment {
  const ua = navigator.userAgent;

  return {
    appVersion,
    os: detectOS(ua),
    browser: detectBrowser(ua),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language,
  };
}
