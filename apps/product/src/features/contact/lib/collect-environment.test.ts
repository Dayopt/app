/**
 * collectEnvironment Unit Tests
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { collectEnvironment } from './collect-environment';

// navigator と Intl をモック
const mockNavigator = { userAgent: '', language: 'en-US' };
const mockTimezone = 'Asia/Tokyo';

vi.stubGlobal('navigator', mockNavigator);
vi.stubGlobal('Intl', {
  DateTimeFormat: () => ({
    resolvedOptions: () => ({ timeZone: mockTimezone }),
  }),
});

function setUA(ua: string) {
  mockNavigator.userAgent = ua;
}

describe('collectEnvironment', () => {
  beforeEach(() => {
    mockNavigator.userAgent = '';
    mockNavigator.language = 'en-US';
  });

  // ── OS 検出 ──

  describe('OS detection', () => {
    it('macOS を検出する', () => {
      setUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
      const env = collectEnvironment('1.0.0');
      expect(env.os).toBe('macOS 10.15.7');
    });

    it('Windows を検出する', () => {
      setUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      const env = collectEnvironment('1.0.0');
      expect(env.os).toBe('Windows 10.0');
    });

    it('Android を検出する', () => {
      setUA('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36');
      const env = collectEnvironment('1.0.0');
      expect(env.os).toBe('Android 14');
    });

    it('iOS (iPhone) を検出する', () => {
      setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_1_2 like Mac OS X) AppleWebKit/605.1.15');
      const env = collectEnvironment('1.0.0');
      expect(env.os).toBe('iOS 17.1.2');
    });

    it('iOS (iPad) を検出する', () => {
      setUA('Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15');
      const env = collectEnvironment('1.0.0');
      expect(env.os).toBe('iOS 16.6');
    });

    it('Linux を検出する', () => {
      setUA('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36');
      const env = collectEnvironment('1.0.0');
      expect(env.os).toBe('Linux');
    });

    it('不明な UA は Unknown を返す', () => {
      setUA('SomeUnknownAgent/1.0');
      const env = collectEnvironment('1.0.0');
      expect(env.os).toBe('Unknown');
    });
  });

  // ── ブラウザ検出 ──

  describe('Browser detection', () => {
    it('Chrome を検出する', () => {
      setUA(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.129 Safari/537.36',
      );
      const env = collectEnvironment('1.0.0');
      expect(env.browser).toBe('Chrome 120.0.6099.129');
    });

    it('Safari を検出する', () => {
      setUA(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
      );
      const env = collectEnvironment('1.0.0');
      expect(env.browser).toBe('Safari 17.2');
    });

    it('Firefox を検出する', () => {
      setUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0');
      const env = collectEnvironment('1.0.0');
      expect(env.browser).toBe('Firefox 121.0');
    });

    it('Edge を検出する（Chrome より優先）', () => {
      setUA(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.2210.91',
      );
      const env = collectEnvironment('1.0.0');
      expect(env.browser).toBe('Edge 120.0.2210.91');
    });

    it('不明なブラウザは Unknown を返す', () => {
      setUA('SomeUnknownAgent/1.0');
      const env = collectEnvironment('1.0.0');
      expect(env.browser).toBe('Unknown');
    });
  });

  // ── その他フィールド ──

  describe('Other fields', () => {
    it('appVersion を返す', () => {
      setUA('');
      const env = collectEnvironment('0.19.0');
      expect(env.appVersion).toBe('0.19.0');
    });

    it('timezone を返す', () => {
      setUA('');
      const env = collectEnvironment('1.0.0');
      expect(env.timezone).toBe('Asia/Tokyo');
    });

    it('language を返す', () => {
      mockNavigator.language = 'ja';
      setUA('');
      const env = collectEnvironment('1.0.0');
      expect(env.language).toBe('ja');
    });
  });
});
