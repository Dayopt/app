'use client';

import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';

import { CACHE_5_MINUTES } from '@/lib/date';
import { api } from '@/lib/trpc';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: 'light' | 'dark';
  isPending: boolean;
}

/** @internal Storybook グローバルデコレータ用にexport */
export const ThemeContext = createContext<ThemeContextType | null>(null);

/** テーマコンテキストを取得するフック */
export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

interface ThemeProviderProps {
  children: ReactNode;
}

/**
 * theme-color メタタグをCSS変数 --background から動的に同期
 * oklchトークンの値がそのまま反映されるため、hex手書き管理が不要
 */
function syncThemeColor() {
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--background').trim();
  if (!bg) return;

  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = bg;
}

// localStorageから安全に値を取得（SSR対応・フォールバック用）
const getStoredTheme = (): Theme => {
  if (typeof window === 'undefined') return 'system';
  return (localStorage.getItem('theme') as Theme) || 'system';
};

/** テーマをDB連携で管理するProvider */
export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  // 初期値はlocalStorageから（SSR対応・DB取得前のフォールバック）
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

  const utils = api.useUtils();

  // DBから設定を取得
  const { data: dbSettings, isPending } = api.userSettings.get.useQuery(undefined, {
    staleTime: CACHE_5_MINUTES,
    refetchOnWindowFocus: false,
    refetchOnMount: false, // ページ遷移時の再取得を無効化
    refetchOnReconnect: false, // 再接続時の再取得を無効化
    retry: false, // 認証エラー時はリトライしない
  });

  // DB更新用mutation
  const updateMutation = api.userSettings.update.useMutation({
    onSuccess: () => {
      utils.userSettings.get.invalidate();
    },
  });

  // DBから取得した設定を反映
  useEffect(() => {
    if (dbSettings && !isPending) {
      if (dbSettings.theme) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 非同期DB設定の反映はuseEffect内でのみ可能
        setThemeState(dbSettings.theme);
      }
    }
  }, [dbSettings, isPending]);

  // テーマ設定（DB保存 + ローカル状態更新）
  const setTheme = useCallback(
    (newTheme: Theme) => {
      setThemeState(newTheme);
      // localStorageにも保存（フォールバック用）
      if (typeof window !== 'undefined') {
        localStorage.setItem('theme', newTheme);
      }
      // DBに保存（認証済みの場合）
      updateMutation.mutate({ theme: newTheme });
    },
    [updateMutation],
  );

  // Handle theme changes
  useEffect(() => {
    const root = window.document.documentElement;

    // Remove existing theme classes
    root.classList.remove('light', 'dark');

    // Determine resolved theme
    let newResolvedTheme: 'light' | 'dark' = 'light';

    if (theme === 'system') {
      const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      newResolvedTheme = systemPrefersDark ? 'dark' : 'light';
    } else {
      newResolvedTheme = theme;
    }

    // Apply theme
    root.classList.add(newResolvedTheme);

    // eslint-disable-next-line react-hooks/set-state-in-effect -- matchMediaによるテーマ解決はブラウザAPI依存
    setResolvedTheme(newResolvedTheme);

    // theme-color メタタグをCSSトークンから同期
    syncThemeColor();
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
      syncThemeColor();
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        resolvedTheme,
        isPending,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};
