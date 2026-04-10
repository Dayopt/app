import 'server-only';

/**
 * Supabase OAuth 2.1 認証ユーティリティ
 *
 * MCP連携のためのOAuth 2.1準拠の認証機能
 *
 * @see https://modelcontextprotocol.io/specification/draft/basic/authorization
 * @see RFC 7636 - PKCE (Proof Key for Code Exchange)
 * @see RFC 8707 - Resource Indicators
 *
 * 主な機能:
 * - OAuth 2.1トークン検証（Bearer Token）
 * - Resource Indicators対応
 * - Service Role Client作成（管理者操作用）
 *
 * 使用例:
 * ```tsx
 * // MCPサーバーからのリクエスト処理
 * import { verifyOAuthToken, createServiceRoleClient } from '@/platform/supabase/oauth'
 *
 * const authHeader = req.headers.get('Authorization')
 * const token = extractBearerToken(authHeader)
 *
 * const { userId, client } = await verifyOAuthToken(token)
 * // userId を使ってRLS適用のクエリ実行
 * ```
 */

import { createClient } from '@supabase/supabase-js';

import { env } from '@/env';
import type { Database } from '@/lib/database.types';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * OAuth 2.1トークン検証結果
 */
export interface OAuthVerificationResult {
  /** 認証されたユーザーID */
  userId: string;
  /** ユーザー情報付きSupabaseクライアント */
  client: SupabaseClient<Database>;
  /** アクセストークン（再利用用） */
  accessToken: string;
  /** トークンの有効期限（Unix timestamp） */
  expiresAt: number;
}

/**
 * OAuth 2.1エラー
 */
export class OAuthError extends Error {
  constructor(
    public readonly code: 'INVALID_TOKEN' | 'EXPIRED_TOKEN' | 'MISSING_TOKEN' | 'INVALID_RESOURCE',
    message: string,
  ) {
    super(message);
    this.name = 'OAuthError';
  }
}

/**
 * Authorization ヘッダーからBearer Tokenを抽出
 *
 * @param authHeader - Authorization ヘッダー（例: "Bearer eyJhbGc..."）
 * @returns 抽出されたトークン
 * @throws {OAuthError} トークンが見つからない場合
 *
 * @example
 * ```ts
 * const token = extractBearerToken(req.headers.get('Authorization'))
 * // → "eyJhbGc..."
 * ```
 */
export function extractBearerToken(authHeader: string | null): string {
  if (!authHeader) {
    throw new OAuthError('MISSING_TOKEN', 'Authorization header is missing');
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1]) {
    throw new OAuthError(
      'INVALID_TOKEN',
      'Authorization header must be in "Bearer <token>" format',
    );
  }

  return match[1];
}

/**
 * OAuth 2.1トークンを検証し、ユーザー情報を取得
 *
 * Supabase Auth の getUser() を使用してトークンを検証します。
 * Resource Indicators (RFC 8707) に対応し、トークンが正しいリソース向けであることを確認します。
 *
 * @param accessToken - アクセストークン
 * @param options - 検証オプション
 * @returns 検証結果（ユーザーID、クライアント等）
 * @throws {OAuthError} トークンが無効な場合
 *
 * @example
 * ```ts
 * const result = await verifyOAuthToken(token, {
 *   resourceIndicator: 'https://api.dayopt.app'
 * })
 * console.log(result.userId) // "uuid-..."
 * ```
 */
export async function verifyOAuthToken(
  accessToken: string,
  options?: {
    /**
     * Resource Indicator (RFC 8707)
     * トークンが特定のリソース向けであることを確認
     * @default undefined（リソース検証なし）
     */
    resourceIndicator?: string;
  },
): Promise<OAuthVerificationResult> {
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // トークン付きクライアント作成
  const client = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });

  // トークン検証 + ユーザー情報取得
  const { data, error } = await client.auth.getUser(accessToken);

  if (error || !data.user) {
    throw new OAuthError('INVALID_TOKEN', error?.message || 'Token verification failed');
  }

  // Resource Indicators (RFC 8707) 検証
  if (options?.resourceIndicator) {
    // トークンのカスタムクレームから対象リソースを確認
    const tokenResource = data.user.app_metadata?.resource_indicator as string | undefined;

    if (tokenResource && tokenResource !== options.resourceIndicator) {
      throw new OAuthError(
        'INVALID_RESOURCE',
        `Token is not valid for resource: ${options.resourceIndicator}`,
      );
    }
  }

  // トークンの有効期限を確認
  const expiresAt = data.user.user_metadata?.exp as number | undefined;
  if (expiresAt && expiresAt * 1000 < Date.now()) {
    throw new OAuthError('EXPIRED_TOKEN', 'Access token has expired');
  }

  return {
    userId: data.user.id,
    client,
    accessToken,
    expiresAt: expiresAt || 0,
  };
}

/**
 * Service Role Client作成（管理者操作用）
 *
 * **警告**: このクライアントはRLSをバイパスします！
 * 必ず適切な権限チェックを実装してください。
 *
 * @returns Service Role権限のSupabaseクライアント
 * @throws {Error} SERVICE_ROLE_KEY が設定されていない場合
 *
 * @example
 * ```ts
 * const adminClient = createServiceRoleClient()
 *
 * // RLSをバイパスした操作（注意！）
 * const { data } = await adminClient
 *   .from('plans')
 *   .select('*')  // すべてのユーザーのプランが取得される
 *
 * // 推奨: userId フィルタリングを明示的に実行
 * const { data } = await adminClient
 *   .from('plans')
 *   .select('*')
 *   .eq('user_id', specificUserId)
 * ```
 */
export function createServiceRoleClient(): SupabaseClient<Database> {
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      fetch: (url, options) => {
        return fetch(url, {
          ...options,
          signal: options?.signal ?? AbortSignal.timeout(15_000),
        });
      },
    },
  });
}

/**
 * OAuth 2.1スコープの検証
 *
 * トークンに含まれるスコープが要求されたスコープを満たすか確認します。
 * 最小権限の原則に従い、必要なスコープのみを要求してください。
 *
 * @param client - 検証済みSupabaseクライアント
 * @param requiredScopes - 要求されるスコープ（例: ['read:plans', 'write:plans']）
 * @returns スコープが満たされている場合true
 *
 * @example
 * ```ts
 * const hasScope = await verifyScopes(client, ['read:plans', 'write:tags'])
 * if (!hasScope) {
 *   throw new Error('Insufficient permissions')
 * }
 * ```
 */
export async function verifyScopes(
  client: SupabaseClient<Database>,
  requiredScopes: string[],
): Promise<boolean> {
  const { data } = await client.auth.getUser();
  if (!data.user) return false;

  // トークンのカスタムクレームからスコープを取得
  const tokenScopes = (data.user.app_metadata?.scopes as string[]) || [];

  // すべての要求されたスコープが含まれているか確認
  return requiredScopes.every((scope) => tokenScopes.includes(scope));
}

/**
 * 認証モードの型定義
 */
export type AuthMode = 'session' | 'oauth' | 'service-role';

/**
 * 認証モード検出
 *
 * リクエストヘッダーから適切な認証モードを自動検出します。
 *
 * @param headers - リクエストヘッダー
 * @returns 検出された認証モード
 *
 * @example
 * ```ts
 * const mode = detectAuthMode(request.headers)
 * // → 'oauth' (Authorization: Bearer がある場合)
 * // → 'service-role' (X-API-Key がある場合)
 * // → 'session' (それ以外、Cookie認証)
 * ```
 */
export function detectAuthMode(headers: Headers | Record<string, string>): AuthMode {
  const getHeader = (name: string): string | null => {
    if (headers instanceof Headers) {
      return headers.get(name);
    }
    return headers[name] || headers[name.toLowerCase()] || null;
  };

  // OAuth 2.1トークン認証
  const authHeader = getHeader('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return 'oauth';
  }

  // Service Role認証
  const apiKey = getHeader('X-API-Key');
  if (apiKey) {
    return 'service-role';
  }

  // デフォルト: Session Cookie認証
  return 'session';
}
