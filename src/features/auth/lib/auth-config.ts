// 認証設定の定数
export const AUTH_CONFIG = {
  // パスワード設定（config.toml の password_requirements = "letters_digits" と一致）
  PASSWORD: {
    MIN_LENGTH: 8,
    REQUIRE_UPPERCASE: false,
    REQUIRE_LOWERCASE: false,
    REQUIRE_NUMBERS: true,
    REQUIRE_SPECIAL_CHARS: false,
  },

  // セッション設定（JWTはSupabase側で1時間、Middlewareが自動リフレッシュ）
  SESSION: {
    TIMEOUT: 30 * 24 * 3600, // 30日（秒）
    REFRESH_THRESHOLD: 300, // 5分前にリフレッシュ
  },

  // レート制限
  RATE_LIMIT: {
    SIGN_UP: 5, // 1時間あたり5回
    SIGN_IN: 10, // 1時間あたり10回
    PASSWORD_RESET: 3, // 1時間あたり3回
  },

  // リダイレクトURL
  REDIRECT_URLS: {
    SIGN_IN: '/calendar/day',
    SIGN_UP: '/calendar/day',
    SIGN_OUT: '/auth',
    PASSWORD_RESET: '/auth/reset-password',
  },

  // エラーメッセージ翻訳キー（Client Componentで t() を使用して翻訳）
  ERROR_MESSAGE_KEYS: {
    INVALID_CREDENTIALS: 'auth.errors.invalidCredentials',
    EMAIL_NOT_CONFIRMED: 'auth.errors.emailNotConfirmed',
    USER_ALREADY_EXISTS: 'auth.errors.emailAlreadyRegistered',
    WEAK_PASSWORD: 'auth.errors.weakPassword',
    TOO_MANY_REQUESTS: 'auth.errors.tooManyRequests',
    NETWORK_ERROR: 'auth.errors.networkError',
    UNKNOWN_ERROR: 'auth.errors.unexpectedError',
  },

  // 成功メッセージ翻訳キー（Client Componentで t() を使用して翻訳）
  SUCCESS_MESSAGE_KEYS: {
    SIGN_UP: 'auth.success.signupSuccess',
    SIGN_IN: 'auth.success.loginSuccess',
    PASSWORD_RESET_SENT: 'auth.success.resetEmailSent',
    PASSWORD_UPDATED: 'auth.success.passwordUpdated',
    SIGN_OUT: 'auth.success.logoutSuccess',
  },

  // パスワード検証メッセージ翻訳キー
  PASSWORD_VALIDATION_KEYS: {
    MIN_LENGTH: 'auth.passwordValidation.minLength',
    REQUIRE_UPPERCASE: 'auth.passwordValidation.requireUppercase',
    REQUIRE_LOWERCASE: 'auth.passwordValidation.requireLowercase',
    REQUIRE_NUMBER: 'auth.passwordValidation.requireNumber',
    REQUIRE_SPECIAL_CHAR: 'auth.passwordValidation.requireSpecialChar',
  },
} as const;

// パスワード強度チェック関数（翻訳キーを返す）
// Client Component側で t() を使って翻訳すること
export function validatePassword(password: string): { isValid: boolean; errorKeys: string[] } {
  const errorKeys: string[] = [];

  if (password.length < AUTH_CONFIG.PASSWORD.MIN_LENGTH) {
    errorKeys.push(AUTH_CONFIG.PASSWORD_VALIDATION_KEYS.MIN_LENGTH);
  }

  if (AUTH_CONFIG.PASSWORD.REQUIRE_UPPERCASE && !/[A-Z]/.test(password)) {
    errorKeys.push(AUTH_CONFIG.PASSWORD_VALIDATION_KEYS.REQUIRE_UPPERCASE);
  }

  if (AUTH_CONFIG.PASSWORD.REQUIRE_LOWERCASE && !/[a-z]/.test(password)) {
    errorKeys.push(AUTH_CONFIG.PASSWORD_VALIDATION_KEYS.REQUIRE_LOWERCASE);
  }

  if (AUTH_CONFIG.PASSWORD.REQUIRE_NUMBERS && !/\d/.test(password)) {
    errorKeys.push(AUTH_CONFIG.PASSWORD_VALIDATION_KEYS.REQUIRE_NUMBER);
  }

  if (AUTH_CONFIG.PASSWORD.REQUIRE_SPECIAL_CHARS && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errorKeys.push(AUTH_CONFIG.PASSWORD_VALIDATION_KEYS.REQUIRE_SPECIAL_CHAR);
  }

  return {
    isValid: errorKeys.length === 0,
    errorKeys,
  };
}

// メールアドレス検証関数
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// セッション有効期限チェック関数
export function isSessionExpiringSoon(expiresAt: number): boolean {
  const now = Math.floor(Date.now() / 1000);
  const timeUntilExpiry = expiresAt - now;
  return timeUntilExpiry <= AUTH_CONFIG.SESSION.REFRESH_THRESHOLD;
}
