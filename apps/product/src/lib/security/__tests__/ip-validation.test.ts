/**
 * IP Validation Unit Tests
 *
 * IPアドレス検証ユーティリティのテスト
 * Vercel由来IPの検証
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
    describe('Vercel X-Real-IP', () => {
      it('should accept valid IPv4 and IPv6 addresses', () => {
        expect(extractClientIp('8.8.8.8')).toBe('8.8.8.8');
        expect(extractClientIp('2001:db8:85a3::8a2e:370:7334')).toBe(
          '2001:db8:85a3::8a2e:370:7334',
        );
      });

      it('should trim a valid platform IP', () => {
        expect(extractClientIp(' 203.0.113.195 ')).toBe('203.0.113.195');
      });
    });

    describe('Edge cases', () => {
      it('should return unknown for null, undefined, and empty values', () => {
        expect(extractClientIp(null)).toBe('unknown');
        expect(extractClientIp(undefined)).toBe('unknown');
        expect(extractClientIp('')).toBe('unknown');
      });

      it('should reject invalid and comma-separated values', () => {
        expect(extractClientIp('invalid')).toBe('unknown');
        expect(extractClientIp('203.0.113.195, 70.41.3.18')).toBe('unknown');
      });
    });

    describe('Security: Header injection prevention', () => {
      it('should reject malicious header values', () => {
        expect(extractClientIp('"><script>alert(1)</script>')).toBe('unknown');
        expect(extractClientIp("'; DROP TABLE users;--")).toBe('unknown');
        expect(extractClientIp('192.168.1.1\r\nX-Injected: malicious')).toBe('unknown');
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
    it('should handle the Vercel platform IP', () => {
      const realIp = '203.0.113.195';
      const clientIp = extractClientIp(realIp);
      expect(clientIp).toBe(realIp);
      expect(isValidIpAddress(clientIp)).toBe(true);
      expect(isPrivateIp(clientIp)).toBe(false);
    });

    it('should handle local development', () => {
      const clientIp = extractClientIp('127.0.0.1');
      expect(clientIp).toBe('127.0.0.1');
      expect(isPrivateIp(clientIp)).toBe(true);
    });
  });
});
