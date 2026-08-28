import { describe, expect, it } from 'vitest';

import { BREAKPOINT_VALUES, MEDIA_QUERIES, TOUCH_TARGET, getDeviceType } from './breakpoints';

describe('breakpoints', () => {
  describe('BREAKPOINT_VALUES', () => {
    it('Tailwind v4デフォルト値と一致する', () => {
      expect(BREAKPOINT_VALUES.sm).toBe(640);
      expect(BREAKPOINT_VALUES.md).toBe(768);
      expect(BREAKPOINT_VALUES.lg).toBe(1024);
      expect(BREAKPOINT_VALUES.xl).toBe(1280);
      expect(BREAKPOINT_VALUES['2xl']).toBe(1536);
    });
  });

  describe('MEDIA_QUERIES', () => {
    it('モバイルクエリが正しい', () => {
      expect(MEDIA_QUERIES.mobile).toBe('(max-width: 767px)');
    });

    it('タブレットクエリが正しい', () => {
      expect(MEDIA_QUERIES.tablet).toBe('(min-width: 768px) and (max-width: 1023px)');
    });

    it('デスクトップクエリが正しい', () => {
      expect(MEDIA_QUERIES.desktop).toBe('(min-width: 1024px)');
    });

    it('タッチデバイスクエリが正しい', () => {
      expect(MEDIA_QUERIES.touch).toBe('(hover: none) and (pointer: coarse)');
    });

    it('マウスデバイスクエリが正しい', () => {
      expect(MEDIA_QUERIES.mouse).toBe('(hover: hover) and (pointer: fine)');
    });
  });

  describe('TOUCH_TARGET', () => {
    it('M3アクセシビリティガイドライン準拠のサイズ', () => {
      // WCAG 2.5.5 最小サイズ
      expect(TOUCH_TARGET.minimum).toBe(44);
      // M3推奨サイズ
      expect(TOUCH_TARGET.standard).toBe(48);
      // FAB等の大型ボタン
      expect(TOUCH_TARGET.large).toBe(56);
      // タッチ要素間の最小マージン
      expect(TOUCH_TARGET.spacing).toBe(8);
    });
  });

  describe('getDeviceType', () => {
    it('768px未満はmobile', () => {
      expect(getDeviceType(0)).toBe('mobile');
      expect(getDeviceType(320)).toBe('mobile');
      expect(getDeviceType(767)).toBe('mobile');
    });

    it('768px-1023pxはtablet', () => {
      expect(getDeviceType(768)).toBe('tablet');
      expect(getDeviceType(900)).toBe('tablet');
      expect(getDeviceType(1023)).toBe('tablet');
    });

    it('1024px以上はdesktop', () => {
      expect(getDeviceType(1024)).toBe('desktop');
      expect(getDeviceType(1280)).toBe('desktop');
      expect(getDeviceType(1920)).toBe('desktop');
    });

    it('境界値が正しく判定される', () => {
      // md境界 (768px)
      expect(getDeviceType(767)).toBe('mobile');
      expect(getDeviceType(768)).toBe('tablet');

      // lg境界 (1024px)
      expect(getDeviceType(1023)).toBe('tablet');
      expect(getDeviceType(1024)).toBe('desktop');
    });
  });
});
