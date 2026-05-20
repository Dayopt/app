/**
 * Auth エラーメッセージのサニタイズ
 *
 * 実装は @/lib/auth-error に移動済み（@/stores/useAuthStore から参照するため）
 * 後方互換のため re-export を維持。
 *
 * @see https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
 */
export { getAuthErrorKey } from '@/lib/auth-error';
