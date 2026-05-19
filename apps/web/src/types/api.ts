/**
 * API レスポンス型定義
 *
 * すべての API エンドポイントのリクエスト/レスポンス型を定義します。
 * 型安全性を確保し、ランタイムエラーを防止します。
 */

// ============================================================================
// タグ API
// ============================================================================

/**
 * タグ API のレスポンス型
 *
 * @endpoint GET /api/tags
 */
export interface TagResponse {
  tag: string;
  count: number;
}

/**
 * 人気タグ（UI 用）
 */
export interface PopularTag {
  name: string;
  count: number;
}

// ============================================================================
// 検索 API
// ============================================================================

/**
 * 検索結果のタイプ
 */
export type SearchResultType = 'blog' | 'docs' | 'release' | 'tags';

/**
 * 検索結果の単一アイテム
 */
export interface SearchResultItem {
  id: string;
  title: string;
  description: string;
  url: string;
  type: SearchResultType;
  breadcrumbs?: string[];
  lastModified: string;
  tags: string[];
  category?: string;
}

/**
 * 検索 API のレスポンス型
 *
 * @endpoint GET /api/search?q={query}
 */
export interface SearchResponse {
  results: SearchResultItem[];
}

// ============================================================================
// コンタクト API
// ============================================================================

/**
 * コンタクトフォームのリクエスト型
 */
export interface ContactRequest {
  name: string;
  email: string;
  category: string;
  subject: string;
  message: string;
}

/**
 * コンタクトフォームのレスポンス型
 *
 * @endpoint POST /api/contact
 */
export interface ContactResponse {
  success: boolean;
  issueNumber: number;
}

// ============================================================================
// Compass Docs API
// ============================================================================

/**
 * Compass ドキュメントの単一アイテム
 */
export interface CompassDoc {
  id: string;
  title: string;
  path: string;
  content: string;
  category: string;
}

/**
 * Compass Docs API のレスポンス型
 *
 * @endpoint GET /api/compass-docs?q={query}
 */
export interface CompassDocsResponse {
  docs: CompassDoc[];
}

// ============================================================================
// エラーレスポンス
// ============================================================================

/**
 * API エラーレスポンス型
 */
export interface ApiErrorResponse {
  error: string;
  code?: string;
  details?: unknown;
}
