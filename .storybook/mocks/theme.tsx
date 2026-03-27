import { useDarkMode } from '@vueless/storybook-dark-mode';
import { type ReactNode, useMemo } from 'react';

import { ThemeContext } from '../../src/shell/providers/theme-provider';

const noop = () => {};

/** Storybook用の軽量ThemeProvider — tRPC/DB不要でuseDarkModeと連動 */
export function StorybookThemeProvider({ children }: { children: ReactNode }) {
  const isDark = useDarkMode();
  const resolvedTheme = isDark ? 'dark' : ('light' as const);

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
