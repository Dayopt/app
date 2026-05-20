/**
 * IP Validation Unit Tests
 *
 * IPアドレス検証ユーティリティのテスト
 * OWASP推奨のX-Forwarded-Forヘッダー検証
 */

import { describe, expect, it } from 'vitest';

import { extractClientIp, isPrivateIp, isValidIpAddress, maskIpAddress } from '../ip-validation';

describe('IP Validation', () => {
  describe('isValidIpAddress', () => {
    describe('IPv4', () => {
      it('should accept valid IPv4 addresses', () => {
        expect(isValidIpAddress('192.168.1.1')).toBe(true);
        expect(isValidIpAddress('10.0.0.1')).toBe(true);
        expect(isValidIpAddress('172.16.0.1')).toBe(true);
        expect(isValidIpAddress('8.8.8.8')).toBe(true);
        expect(isValidIpAddress('255.255.255.255')).toBe(true);
        expect(isValidIpAddress('0.0.0.0')).toBe(true);
      });

      it('should reject invalid IPv4 addresses', () => {
        expect(isValidIpAddress('256.1.1.1')).toBe(false);
        expect(isValidIpAddress('192.168.1')).toBe(false);
        expect(isValidIpAddress('192.168.1.1.1')).toBe(false);
        expect(isValidIpAddress('192.168.1.a')).toBe(false);
        expect(isValidIpAddress('192.168.1.-1')).toBe(false);
        expect(isValidIpAddress('192.168.1.256')).toBe(false);
      });
    });

    describe('IPv6', () => {
      it('should accept valid IPv6 addresses', () => {
        expect(isValidIpAddress('::1')).toBe(true);
        expect(isValidIpAddress('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe(true);
        expect(isValidIpAddress('2001:db8:85a3::8a2e:370:7334')).toBe(true);
        expect(isValidIpAddress('fe80::1')).toBe(true);
      });
    });

    describe('Invalid inputs', () => {
      it('should reject empty string', () => {
        expect(isValidIpAddress('')).toBe(false);
      });

      it('should reject null/undefined', () => {
        expect(isValidIpAddress(null as unknown as string)).toBe(false);
        expect(isValidIpAddress(undefined as unknown as string)).toBe(false);
      });

      it('should reject non-IP strings', () => {
        expect(isValidIpAddress('localhost')).toBe(false);
        expect(isValidIpAddress('example.com')).toBe(false);
        expect(isValidIpAddress('not-an-ip')).toBe(false);
        expect(isValidIpAddress('192.168.1.1:8080')).toBe(false); // port included
      });

      it('should handle whitespace', () => {
        expect(isValidIpAddress(' 192.168.1.1 ')).toBe(true);
        expect(isValidIpAddress('  ')).toBe(false);
      });
    });
  });

  describe('extractClientIp', () => {
    describe('X-Real-IP priority', () => {
      it('should prefer X-Real-IP when valid', () => {
        const result = extractClientIp('192.168.1.1, 10.0.0.1', '8.8.8.8');
        expect(result).toBe('8.8.8.8');
      });

      it('should ignore invalid X-Real-IP', () => {
        const result = extractClientIp('192.168.1.1', 'invalid');
        expect(result).toBe('192.168.1.1');
      });
    });

    describe('X-Forwarded-For parsing', () => {
      it('should extract first valid IP from X-Forwarded-For', () => {
        const result = extractClientIp('203.0.113.195, 70.41.3.18, 150.172.238.178', null);
        expect(result).toBe('203.0.113.195');
      });

      it('should skip invalid IPs in chain', () => {
        const result = extractClientIp('invalid, 192.168.1.1, 10.0.0.1', null);
        expect(result).toBe('192.168.1.1');
      });

      it('should handle single IP', () => {
        const result = extractClientIp('192.168.1.100', null);
        expect(result).toBe('192.168.1.100');
      });

      it('should handle extra whitespace', () => {
        const result = extractClientIp('  192.168.1.1  ,  10.0.0.1  ', null);
        expect(result).toBe('192.168.1.1');
      });
    });

    describe('Edge cases', () => {
      it('should return unknown for null/undefined inputs', () => {
        expect(extractClientIp(null, null)).toBe('unknown');
        expect(extractClientIp(undefined, undefined)).toBe('unknown');
      });

      it('should return unknown for empty string', () => {
        expect(extractClientIp('', '')).toBe('unknown');
      });

      it('should return unknown when all IPs are invalid', () => {
        expect(extractClientIp('invalid1, invalid2', 'also-invalid')).toBe('unknown');
      });
    });

    describe('Security: Header injection prevention', () => {
      it('should reject malicious header values', () => {
        // 攻撃者がヘッダーを偽装しようとするケース
        expect(extractClientIp('"><script>alert(1)</script>', null)).toBe('unknown');
        expect(extractClientIp("'; DROP TABLE users;--", null)).toBe('unknown');
        // 改行を含む文字列は有効なIPとして認識しない（セキュリティ上正しい動作）
        expect(extractClientIp('192.168.1.1\r\nX-Injected: malicious', null)).toBe('unknown');
      });
    });
  });

  describe('isPrivateIp', () => {
    describe('Class A private (10.0.0.0/8)', () => {
      it('should identify 10.x.x.x as private', () => {
        expect(isPrivateIp('10.0.0.1')).toBe(true);
        expect(isPrivateIp('10.255.255.255')).toBe(true);
        expect(isPrivateIp('10.100.50.25')).toBe(true);
      });
    });

    describe('Class B private (172.16.0.0/12)', () => {
      it('should identify 172.16-31.x.x as private', () => {
        expect(isPrivateIp('172.16.0.1')).toBe(true);
        expect(isPrivateIp('172.31.255.255')).toBe(true);
        expect(isPrivateIp('172.20.100.50')).toBe(true);
      });

      it('should not identify 172.15.x.x or 172.32.x.x as private', () => {
        expect(isPrivateIp('172.15.0.1')).toBe(false);
        expect(isPrivateIp('172.32.0.1')).toBe(false);
      });
    });

    describe('Class C private (192.168.0.0/16)', () => {
      it('should identify 192.168.x.x as private', () => {
        expect(isPrivateIp('192.168.0.1')).toBe(true);
        expect(isPrivateIp('192.168.255.255')).toBe(true);
        expect(isPrivateIp('192.168.1.100')).toBe(true);
      });
    });

    describe('Loopback (127.0.0.0/8)', () => {
      it('should identify 127.x.x.x as private', () => {
        expect(isPrivateIp('127.0.0.1')).toBe(true);
        expect(isPrivateIp('127.255.255.255')).toBe(true);
      });

      it('should identify IPv6 loopback as private', () => {
        expect(isPrivateIp('::1')).toBe(true);
      });
    });

    describe('Public IPs', () => {
      it('should identify public IPs as not private', () => {
        expect(isPrivateIp('8.8.8.8')).toBe(false);
        expect(isPrivateIp('1.1.1.1')).toBe(false);
        expect(isPrivateIp('203.0.113.1')).toBe(false);
        expect(isPrivateIp('192.0.2.1')).toBe(false);
      });
    });

    describe('Invalid inputs', () => {
      it('should return false for invalid IPs', () => {
        expect(isPrivateIp('invalid')).toBe(false);
        expect(isPrivateIp('')).toBe(false);
      });
    });
  });

  describe('maskIpAddress', () => {
    describe('IPv4 masking', () => {
      it('should mask last octet to 0', () => {
        expect(maskIpAddress('192.168.1.100')).toBe('192.168.1.0');
        expect(maskIpAddress('10.0.0.255')).toBe('10.0.0.0');
        expect(maskIpAddress('8.8.8.8')).toBe('8.8.8.0');
      });
    });

    describe('IPv6 masking', () => {
      it('should mask last segment', () => {
        const result = maskIpAddress('2001:db8:85a3::8a2e:370:7334');
        expect(result).toContain(':0');
      });

      it('should mask loopback', () => {
        const result = maskIpAddress('::1');
        expect(result).toBe('::0');
      });
    });

    describe('Invalid inputs', () => {
      it('should return unknown for invalid IPs', () => {
        expect(maskIpAddress('invalid')).toBe('unknown');
        expect(maskIpAddress('')).toBe('unknown');
      });
    });

    describe('Privacy preservation', () => {
      it('should remove identifying information', () => {
        const original = '203.0.113.195';
        const masked = maskIpAddress(original);

        expect(masked).not.toBe(original);
        expect(masked).toBe('203.0.113.0');
      });
    });
  });

  describe('Integration: Common usage patterns', () => {
    it('should handle typical proxy chain', () => {
      // クライアント -> プロキシ1 -> プロキシ2 -> サーバー
      const xff = '203.0.113.195, 70.41.3.18, 150.172.238.178';

      const clientIp = extractClientIp(xff, null);
      expect(clientIp).toBe('203.0.113.195');
      expect(isValidIpAddress(clientIp)).toBe(true);
      expect(isPrivateIp(clientIp)).toBe(false);
    });

    it('should handle Cloudflare/CDN setup', () => {
      // CDNが設定するX-Real-IP
      const realIp = '203.0.113.195';
      const xff = 'internal-proxy, 10.0.0.1';

      const clientIp = extractClientIp(xff, realIp);
      expect(clientIp).toBe(realIp);
    });

    it('should handle local development', () => {
      const clientIp = extractClientIp(null, '127.0.0.1');
      expect(clientIp).toBe('127.0.0.1');
      expect(isPrivateIp(clientIp)).toBe(true);
    });
  });
});
