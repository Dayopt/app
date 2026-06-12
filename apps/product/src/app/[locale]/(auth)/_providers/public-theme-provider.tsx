'use client';

/**
 * 公開ページ用の軽量ThemeProvider
 *
 * @description
 * tRPCを使用せず、localStorageのみでテーマ管理を行う。
 * 認証不要なページ（/auth/、/legal/、/error/）で使用。
 */

import { createContext, ReactNode, useCallback, useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';

interface PublicThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: 'light' | 'dark';
  isLoading: boolean;
}

const PublicThemeContext = createContext<PublicThemeContextType | null>(null);

interface PublicThemeProviderProps {
  children: ReactNode;
}

// localStorageから安全に値を取得（SSR対応）
const getStoredTheme = (): Theme => {
  if (typeof window === 'undefined') return 'system';
  return (localStorage.getItem('theme') as Theme) || 'system';
};

/** 公開ページ用の軽量ThemeProvider（localStorageのみでテーマ管理） */
export const PublicThemeProvider = ({ children }: PublicThemeProviderProps) => {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

  // テーマ設定（localStorageのみ）
  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    if (typeof window !== 'undefined') {
      localStorage.setItem('theme', newTheme);
    }
  }, []);

  // Handle theme changes
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');

    let newResolvedTheme: 'light' | 'dark' = 'light';

    if (theme === 'system') {
      const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      newResolvedTheme = systemPrefersDark ? 'dark' : 'light';
    } else {
      newResolvedTheme = theme;
    }

    root.classList.add(newResolvedTheme);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- matchMediaによるテーマ解決はブラウザAPI依存
    setResolvedTheme(newResolvedTheme);
  }, [theme]);

  // Listen for system theme changes
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = () => {
      const newResolvedTheme = mediaQuery.matches ? 'dark' : 'light';
      setResolvedTheme(newResolvedTheme);
      document.documentElement.classList.remove('light', 'dark');
      document.documentElement.classList.add(newResolvedTheme);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  return (
    <PublicThemeContext.Provider
      value={{
        theme,
        setTheme,
        resolvedTheme,
        isLoading: false,
      }}
    >
      {children}
    </PublicThemeContext.Provider>
  );
};
