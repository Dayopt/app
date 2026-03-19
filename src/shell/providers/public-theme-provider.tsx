'use client';

/**
 * 公開ページ用の軽量ThemeProvider
 *
 * @description
 * tRPCを使用せず、localStorageのみでテーマ管理を行う。
 * 認証不要なページ（/auth/、/legal/、/error/）で使用。
 */

import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';
type ColorScheme = 'blue' | 'green' | 'purple' | 'orange' | 'red';

interface PublicThemeContextType {
  theme: Theme;
  colorScheme: ColorScheme;
  setTheme: (theme: Theme) => void;
  setColorScheme: (colorScheme: ColorScheme) => void;
  resolvedTheme: 'light' | 'dark';
  isLoading: boolean;
}

const PublicThemeContext = createContext<PublicThemeContextType | null>(null);

/** 公開ページ用テーマコンテキストを取得するフック */
export function usePublicTheme() {
  const context = useContext(PublicThemeContext);
  if (!context) {
    throw new Error('usePublicTheme must be used within a PublicThemeProvider');
  }
  return context;
}

interface PublicThemeProviderProps {
  children: ReactNode;
}

// カラースキーム適用
function applyColorScheme(scheme: ColorScheme) {
  const root = window.document.documentElement;
  root.classList.remove(
    'scheme-blue',
    'scheme-green',
    'scheme-purple',
    'scheme-orange',
    'scheme-red',
  );
  root.classList.add(`scheme-${scheme}`);
}

// localStorageから安全に値を取得（SSR対応）
const getStoredTheme = (): Theme => {
  if (typeof window === 'undefined') return 'system';
  return (localStorage.getItem('theme') as Theme) || 'system';
};

const getStoredColorScheme = (): ColorScheme => {
  if (typeof window === 'undefined') return 'blue';
  return (localStorage.getItem('colorScheme') as ColorScheme) || 'blue';
};

/** 公開ページ用の軽量ThemeProvider（localStorageのみでテーマ管理） */
export const PublicThemeProvider = ({ children }: PublicThemeProviderProps) => {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);
  const [colorScheme, setColorSchemeState] = useState<ColorScheme>(getStoredColorScheme);
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

  // テーマ設定（localStorageのみ）
  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    if (typeof window !== 'undefined') {
      localStorage.setItem('theme', newTheme);
    }
  }, []);

  // カラースキーム設定（localStorageのみ）
  const setColorScheme = useCallback((newColorScheme: ColorScheme) => {
    setColorSchemeState(newColorScheme);
    if (typeof window !== 'undefined') {
      localStorage.setItem('colorScheme', newColorScheme);
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
    applyColorScheme(colorScheme);
  }, [theme, colorScheme]);

  // Listen for system theme changes
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = () => {
      const newResolvedTheme = mediaQuery.matches ? 'dark' : 'light';
      setResolvedTheme(newResolvedTheme);
      document.documentElement.classList.remove('light', 'dark');
      document.documentElement.classList.add(newResolvedTheme);
      applyColorScheme(colorScheme);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme, colorScheme]);

  return (
    <PublicThemeContext.Provider
      value={{
        theme,
        colorScheme,
        setTheme,
        setColorScheme,
        resolvedTheme,
        isLoading: false,
      }}
    >
      {children}
    </PublicThemeContext.Provider>
  );
};
