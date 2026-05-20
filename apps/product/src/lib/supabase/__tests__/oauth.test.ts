/**
 * OAuth 2.1認証ユーティリティのテスト
 *
 * 注意: これは基本的なテストケースです。
 * 実際のテストでは、Supabase Auth APIのモックが必要です。
 */

import { describe, expect, it } from 'vitest';

import { detectAuthMode, extractBearerToken, OAuthError } from '../oauth';

describe('OAuth 2.1 Utilities', () => {
  describe('extractBearerToken', () => {
    it('正しいBearer Tokenを抽出できる', () => {
      const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
      const authHeader = `Bearer ${token}`;

      expect(extractBearerToken(authHeader)).toBe(token);
    });

    it('大文字小文字を区別しない', () => {
      const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
      const authHeader = `bearer ${token}`;

      expect(extractBearerToken(authHeader)).toBe(token);
    });

    it('Authorization headerがない場合はエラー', () => {
      expect(() => extractBearerToken(null)).toThrow(OAuthError);
      expect(() => extractBearerToken(null)).toThrow('Authorization header is missing');
    });

    it('Bearer形式でない場合はエラー', () => {
      expect(() => extractBearerToken('Basic dXNlcjpwYXNz')).toThrow(OAuthError);
      expect(() => extractBearerToken('Basic dXNlcjpwYXNz')).toThrow(
        'Authorization header must be in "Bearer <token>" format',
      );
    });
  });

  describe('detectAuthMode', () => {
    it('Bearer Tokenがある場合はoauth', () => {
      const headers = {
        authorization: 'Bearer eyJhbGc...',
      };

      expect(detectAuthMode(headers)).toBe('oauth');
    });

    it('X-API-Keyがある場合はservice-role', () => {
      const headers = {
        'x-api-key': 'secret-key',
      };

      expect(detectAuthMode(headers)).toBe('service-role');
    });

    it('どちらもない場合はsession', () => {
      const headers = {};

      expect(detectAuthMode(headers)).toBe('session');
    });

    it('Headers オブジェクトでも動作する', () => {
      const headers = new Headers();
      headers.set('Authorization', 'Bearer eyJhbGc...');

      expect(detectAuthMode(headers)).toBe('oauth');
    });

    it('大文字小文字を区別しない（Headers）', () => {
      const headers = new Headers();
      headers.set('authorization', 'Bearer eyJhbGc...');

      expect(detectAuthMode(headers)).toBe('oauth');
    });
  });
});

/**
 * 統合テストのサンプル
 *
 * 実際のSupabase Authを使用したテストは、環境変数設定と
 * テスト用のアクセストークン取得が必要です。
 *
 * @example
 * ```bash
 * # テスト用のアクセストークンを取得
 * SUPABASE_URL=http://127.0.0.1:54321
 * SUPABASE_ANON_KEY=...
 * TEST_USER_EMAIL=test@example.com
 * TEST_USER_PASSWORD=password
 *
 * # トークン取得（curlやPostman等）
 * curl -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
 *   -H "apikey: $SUPABASE_ANON_KEY" \
 *   -H "Content-Type: application/json" \
 *   -d "{\"email\":\"$TEST_USER_EMAIL\",\"password\":\"$TEST_USER_PASSWORD\"}"
 *
 * # 取得したaccess_tokenを環境変数に設定
 * TEST_ACCESS_TOKEN=eyJhbGc...
 * ```
 */
