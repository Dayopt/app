'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import * as React from 'react';

type ThemeProviderProps = {
  children: React.ReactNode;
  attribute?: 'class' | 'data-theme' | 'data-mode';
  defaultTheme?: string;
  enableSystem?: boolean;
  disableTransitionOnChange?: boolean;
};

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange={false}
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}

export { useTheme } from 'next-themes';
