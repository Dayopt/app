/**
 * Zustand認証ストア
 * Context APIから移行してパフォーマンスを最適化
 *
 * @see docs/product/specs/auth.md
 */
import { logger } from '@/lib/logger';
import { captureUnexpectedAuthError, observeAuthOperation } from '@/lib/sentry';
import { createClient } from '@/lib/supabase/client';
import type {
  AuthError,
  AuthResponse,
  OAuthResponse,
  Session,
  User,
  UserResponse,
} from '@supabase/supabase-js';
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

import { getAuthErrorKey, resolveAuthErrorKey } from '@/lib/auth-error';

interface UserMetadata {
  [key: string]: string | number | boolean | null;
}

interface AuthState {
  // State
  user: User | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
  /** セッションが失効したことを示すフラグ（UIで通知→リダイレクトに使用） */
  _sessionExpired: boolean;

  // Actions
  initialize: () => Promise<void>;
  signUp: (
    email: string,
    password: string,
    options?: { captchaToken?: string; metadata?: UserMetadata },
  ) => Promise<AuthResponse>;
  signIn: (
    email: string,
    password: string,
    options?: { captchaToken?: string },
  ) => Promise<AuthResponse>;
  signInWithOAuth: (provider: 'google') => Promise<OAuthResponse>;
  signOut: () => Promise<{ error: AuthError | null }>;
  resetPassword: (
    email: string,
    options?: { captchaToken?: string },
  ) => Promise<{ error: AuthError | null }>;
  // @supabase/auth-js 2.106.2 以降 updateUser は session を含まない UserResponse を返す
  updatePassword: (password: string) => Promise<UserResponse>;
  clearError: () => void;

  // Internal
  _setUser: (user: User | null) => void;
  _setSession: (session: Session | null) => void;
  _setLoading: (loading: boolean) => void;
  _setError: (error: string | null) => void;
}

/** 認証状態を管理するZustandストア */
export const useAuthStore = create<AuthState>()(
  devtools(
    (set, _get) => ({
      // Initial state
      user: null,
      session: null,
      loading: true,
      error: null,
      _sessionExpired: false,

      // Initialize authentication state
      initialize: async () => {
        // オフライン時はタイムアウトを延長（偽ログアウト防止）
        const isOffline =
          typeof navigator !== 'undefined' && 'onLine' in navigator && !navigator.onLine;
        const TIMEOUT_MS = isOffline ? 30_000 : 5_000;

        try {
          const supabase = createClient();

          // タイムアウト付きでgetSession実行
          const sessionPromise = observeAuthOperation('get_session', () =>
            supabase.auth.getSession(),
          );
          const timeoutPromise = new Promise<{ data: { session: null }; error: null }>(
            (resolve) => {
              setTimeout(() => {
                logger.warn('[AuthStore] Session retrieval timed out, proceeding without session');
                resolve({ data: { session: null }, error: null });
              }, TIMEOUT_MS);
            },
          );

          const { data, error } = await Promise.race([sessionPromise, timeoutPromise]);

          if (error) {
            logger.error('[AuthStore] Session retrieval error:', error);
            // エラー時もloadingをfalseにして画面表示を許可
            set({ error: null, loading: false, user: null, session: null });
            return;
          }

          set({
            session: data.session,
            user: data.session?.user ?? null,
            loading: false,
            error: null,
          });

          // Auth state changeリスナーは非同期で設定（ブロックしない）
          try {
            const {
              data: { subscription },
            } = supabase.auth.onAuthStateChange((event, session) => {
              const previousUser = _get().user;
              set({
                session,
                user: session?.user ?? null,
              });

              // C2: セッション失効の検出 — 以前ログイン済みだったのに session が消えた場合
              if (previousUser && !session?.user && event === 'SIGNED_OUT') {
                set({ _sessionExpired: true });
              }
            });

            // Cleanup subscription on unmount
            if (typeof window !== 'undefined') {
              window.addEventListener('beforeunload', () => {
                subscription.unsubscribe();
              });
            }
          } catch (listenerError) {
            logger.warn('[AuthStore] Failed to set up auth state listener:', listenerError);
            captureUnexpectedAuthError(listenerError, { operation: 'subscribe_auth_state' });
            // リスナー設定失敗は致命的ではない
          }
        } catch (err) {
          logger.error('[AuthStore] Initialization error:', err);
          captureUnexpectedAuthError(err, { operation: 'initialize' });
          // エラー時もloadingをfalseにして画面表示を許可
          set({ error: null, loading: false, user: null, session: null });
        }
      },

      // Sign up with email and password
      signUp: async (email, password, options) => {
        set({ loading: true, error: null });

        try {
          const supabase = createClient();
          const result = await supabase.auth.signUp({
            email,
            password,
            options: {
              // 確認メールのリンク検証後の着地先。send-auth-email hook が
              // origin + path を confirm route の next に変換する
              emailRedirectTo: `${window.location.origin}/week`,
              ...(options?.captchaToken && { captchaToken: options.captchaToken }),
              ...(options?.metadata && { data: options.metadata }),
            },
          });

          if (result.error) {
            captureUnexpectedAuthError(result.error, { operation: 'sign_up' });
            const safeError = getAuthErrorKey(result.error.message, 'signup');
            set({ error: safeError, loading: false });
          } else {
            set({
              session: result.data.session,
              user: result.data.user,
              loading: false,
              error: null,
            });
          }

          return result;
        } catch (err) {
          captureUnexpectedAuthError(err, { operation: 'sign_up' });
          const safeError = resolveAuthErrorKey(err, 'signup');
          set({ error: safeError, loading: false });
          return {
            data: { user: null, session: null },
            error: { message: safeError } as AuthError,
          };
        }
      },

      // Sign in with email and password
      signIn: async (email, password, options) => {
        set({ loading: true, error: null });

        try {
          const supabase = createClient();
          const supabaseOptions = options?.captchaToken
            ? { captchaToken: options.captchaToken }
            : undefined;
          const result = await supabase.auth.signInWithPassword({
            email,
            password,
            ...(supabaseOptions && { options: supabaseOptions }),
          });

          if (result.error) {
            captureUnexpectedAuthError(result.error, { operation: 'sign_in' });
            const safeError = getAuthErrorKey(result.error.message, 'login');
            set({ error: safeError, loading: false });
          } else {
            set({
              session: result.data.session,
              user: result.data.user,
              loading: false,
              error: null,
            });
          }

          return result;
        } catch (err) {
          captureUnexpectedAuthError(err, { operation: 'sign_in' });
          const safeError = resolveAuthErrorKey(err, 'login');
          set({ error: safeError, loading: false });
          return {
            data: { user: null, session: null },
            error: { message: safeError } as AuthError,
          };
        }
      },

      // Sign in with OAuth
      signInWithOAuth: async (provider) => {
        set({ loading: true, error: null });

        try {
          const supabase = createClient();
          const result = await supabase.auth.signInWithOAuth({
            provider,
            options: {
              redirectTo: `${window.location.origin}/auth/callback`,
            },
          });

          if (result.error) {
            captureUnexpectedAuthError(result.error, { operation: 'sign_in_oauth' });
            const safeError = getAuthErrorKey(result.error.message, 'oauth');
            set({ error: safeError, loading: false });
          }

          return result;
        } catch (err) {
          captureUnexpectedAuthError(err, { operation: 'sign_in_oauth' });
          const safeError = resolveAuthErrorKey(err, 'oauth');
          set({ error: safeError, loading: false });
          return {
            data: { provider, url: null },
            error: { message: safeError } as AuthError,
          };
        }
      },

      // Sign out
      signOut: async () => {
        set({ loading: true, error: null });

        try {
          const supabase = createClient();
          const result = await supabase.auth.signOut();

          if (result.error) {
            captureUnexpectedAuthError(result.error, { operation: 'sign_out' });
            set({ error: 'auth.errors.unexpectedError', loading: false });
          } else {
            set({
              user: null,
              session: null,
              loading: false,
              error: null,
            });
          }

          return { error: result.error };
        } catch (err) {
          captureUnexpectedAuthError(err, { operation: 'sign_out' });
          set({ error: 'auth.errors.unexpectedError', loading: false });
          return { error: { message: 'auth.errors.unexpectedError' } as AuthError };
        }
      },

      // Reset password
      // OWASP: パスワードリセットはエラーでも成功メッセージを表示（メール存在の漏洩防止）
      resetPassword: async (email, options) => {
        set({ loading: true, error: null });

        try {
          const supabase = createClient();
          const result = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/auth/reset-password`,
            // Supabase 側で Bot Protection が有効なため、token が無いと /recover は
            // captcha_failed で 400 を返す（送信自体が成立しない）
            ...(options?.captchaToken && { captchaToken: options.captchaToken }),
          });

          if (result.error) {
            captureUnexpectedAuthError(result.error, { operation: 'reset_password' });
            const safeError = getAuthErrorKey(result.error.message, 'resetPassword');
            set({ error: safeError, loading: false });
          } else {
            set({ loading: false });
          }

          return { error: result.error };
        } catch (err) {
          captureUnexpectedAuthError(err, { operation: 'reset_password' });
          set({ error: 'auth.errors.unexpectedError', loading: false });
          return { error: { message: 'auth.errors.unexpectedError' } as AuthError };
        }
      },

      // Update password
      updatePassword: async (password) => {
        set({ loading: true, error: null });

        try {
          const supabase = createClient();
          const result = await supabase.auth.updateUser({ password });

          if (result.error) {
            captureUnexpectedAuthError(result.error, { operation: 'update_password' });
            const safeError = getAuthErrorKey(result.error.message, 'updatePassword');
            set({ error: safeError, loading: false });
          } else {
            // recovery でパスワードを変更した後は他端末の session を失効させる。
            // アカウント乗っ取り被害者が最も自然に取る回復操作（パスワードリセット）で
            // 攻撃者の refresh token を道連れにする。失敗してもパスワード更新自体は
            // 成功しているため、結果は分岐させない（PasswordChangeDialog と同じ扱い）。
            // `observeAuthOperation` は catch した例外を re-throw する契約なので、ここで
            // 握り潰さないと外側の catch に落ち、成功した更新が失敗として返ってしまう。
            try {
              await observeAuthOperation('sign_out_other_sessions', () =>
                supabase.auth.signOut({ scope: 'others' }),
              );
            } catch {
              // 上記コメントの通り、他端末の失効に失敗しても更新自体の成功は変えない。
            }
            set({ loading: false });
          }

          return result;
        } catch (err) {
          captureUnexpectedAuthError(err, { operation: 'update_password' });
          set({ error: 'auth.errors.unexpectedError', loading: false });
          return {
            data: { user: null },
            error: { message: 'auth.errors.unexpectedError' } as AuthError,
          };
        }
      },

      // Clear error
      clearError: () => {
        set({ error: null });
      },

      // Internal setters (for direct state manipulation if needed)
      _setUser: (user) => set({ user }),
      _setSession: (session) => set({ session }),
      _setLoading: (loading) => set({ loading }),
      _setError: (error) => set({ error }),
    }),
    {
      name: 'auth-store',
      enabled: process.env.NODE_ENV !== 'production',
    },
  ),
);

/** セッション失効フラグを選択するセレクター */
export const selectSessionExpired = (state: AuthState) => state._sessionExpired;
