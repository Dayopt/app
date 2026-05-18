import { useDarkMode } from '@vueless/storybook-dark-mode';
import { type ReactNode, useMemo } from 'react';

import { ThemeContext } from '@/app/[locale]/(app)/_providers/theme-provider';

const noop = () => {};

/** Storybook用の軽量ThemeProvider — tRPC/DB不要でuseDarkModeと連動 */
export function StorybookThemeProvider({ children }: { children: ReactNode }) {
  const isDark = useDarkMode();
  const resolvedTheme: 'light' | 'dark' = isDark ? 'dark' : 'light';

  const value = useMemo(
    () => ({
      theme: 'system' as const,
      colorScheme: 'blue' as const,
      setTheme: noop,
      setColorScheme: noop,
      resolvedTheme,
      isPending: false,
    }),
    [resolvedTheme],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}
