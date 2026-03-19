/**
 * IP Address Validation Utilities
 *
 * X-Forwarded-Forヘッダーインジェクション対策
 * OWASP推奨のIP検証を実装
 *
 * @see https://owasp.org/www-community/attacks/Web_Parameter_Tampering
 */

/**
 * IPv4アドレスの正規表現パターン
 * 例: 192.168.1.1, 10.0.0.1
 */
const IPV4_REGEX =
  /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

/**
 * IPv6アドレスの正規表現パターン
 * 完全形式およびロングバック形式
 */
const IPV6_REGEX =
  /^(?:(?:[a-fA-F\d]{1,4}:){7}[a-fA-F\d]{1,4}|(?:[a-fA-F\d]{1,4}:){1,7}:|(?:[a-fA-F\d]{1,4}:){1,6}:[a-fA-F\d]{1,4}|(?:[a-fA-F\d]{1,4}:){1,5}(?::[a-fA-F\d]{1,4}){1,2}|(?:[a-fA-F\d]{1,4}:){1,4}(?::[a-fA-F\d]{1,4}){1,3}|(?:[a-fA-F\d]{1,4}:){1,3}(?::[a-fA-F\d]{1,4}){1,4}|(?:[a-fA-F\d]{1,4}:){1,2}(?::[a-fA-F\d]{1,4}){1,5}|[a-fA-F\d]{1,4}:(?::[a-fA-F\d]{1,4}){1,6}|:(?:(?::[a-fA-F\d]{1,4}){1,7}|:)|fe80:(?::[a-fA-F\d]{0,4}){0,4}%[0-9a-zA-Z]+|::(?:ffff(?::0{1,4})?:)?(?:(?:25[0-5]|(?:2[0-4]|1?[0-9])?[0-9])\.){3}(?:25[0-5]|(?:2[0-4]|1?[0-9])?[0-9])|(?:[a-fA-F\d]{1,4}:){1,4}:(?:(?:25[0-5]|(?:2[0-4]|1?[0-9])?[0-9])\.){3}(?:25[0-5]|(?:2[0-4]|1?[0-9])?[0-9]))$/;

/**
 * IPアドレスが有効かどうかを検証
 */
export function isValidIpAddress(ip: string): boolean {
  if (!ip || typeof ip !== 'string') {
    return false;
  }

  const trimmed = ip.trim();
  return IPV4_REGEX.test(trimmed) || IPV6_REGEX.test(trimmed);
}

/**
 * X-Forwarded-Forヘッダーから安全にクライアントIPを抽出
 *
 * X-Forwarded-For形式: "client, proxy1, proxy2"
 * - 最初のIPがクライアントIPだが、偽装可能
 * - 各IPを検証し、最初の有効なIPを返す
 * - 無効なIPは除外
 *
 * @param forwardedFor X-Forwarded-Forヘッダー値
 * @param realIp X-Real-IPヘッダー値（フォールバック）
 * @returns 検証済みIPアドレス、または 'unknown'
 */
export function extractClientIp(
  forwardedFor: string | null | undefined,
  realIp?: string | null,
): string {
  // X-Real-IPを優先（単一IP、プロキシ設定済み）
  if (realIp && isValidIpAddress(realIp)) {
    return realIp.trim();
  }

  // X-Forwarded-Forを解析
  if (forwardedFor) {
    const ips = forwardedFor.split(',').map((ip) => ip.trim());

    // 最初の有効なIPを返す
    for (const ip of ips) {
      if (isValidIpAddress(ip)) {
        return ip;
      }
    }
  }

  return 'unknown';
}

/**
 * プライベートIPアドレスかどうかを判定
 *
 * プライベートIP範囲:
 * - 10.0.0.0/8
 * - 172.16.0.0/12
 * - 192.168.0.0/16
 * - 127.0.0.0/8 (loopback)
 */
export function isPrivateIp(ip: string): boolean {
  if (!isValidIpAddress(ip)) {
    return false;
  }

  // IPv6のループバック
  if (ip === '::1') {
    return true;
  }

  // IPv4のみチェック
  if (!IPV4_REGEX.test(ip)) {
    return false;
  }

  const parts = ip.split('.').map(Number);
  const [p0, p1] = parts;

  // 10.0.0.0/8
  if (p0 === 10) {
    return true;
  }

  // 172.16.0.0/12
  if (p0 === 172 && p1 !== undefined && p1 >= 16 && p1 <= 31) {
    return true;
  }

  // 192.168.0.0/16
  if (p0 === 192 && p1 === 168) {
    return true;
  }

  // 127.0.0.0/8 (loopback)
  if (p0 === 127) {
    return true;
  }

  return false;
}

/**
 * IPアドレスをマスク（匿名化）
 * プライバシー保護のため、最後のオクテットを0に
 *
 * 例: 192.168.1.100 → 192.168.1.0
 */
export function maskIpAddress(ip: string): string {
  if (!isValidIpAddress(ip)) {
    return 'unknown';
  }

  if (IPV4_REGEX.test(ip)) {
    const parts = ip.split('.');
    parts[3] = '0';
    return parts.join('.');
  }

  // IPv6: 最後の16ビットをマスク
  if (IPV6_REGEX.test(ip)) {
    const lastColon = ip.lastIndexOf(':');
    return ip.substring(0, lastColon) + ':0';
  }

  return 'unknown';
}
