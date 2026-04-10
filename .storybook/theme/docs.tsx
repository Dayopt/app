/**
 * Storybook Docs カスタマイズ
 *
 * DocsTemplate: @tailwindcss/typography の prose でタイポグラフィ適用
 * ThemedDocsContainer: @vueless/storybook-dark-mode の theme 自動切替
 */
import type { ComponentProps } from 'react';

import {
  Controls,
  Description,
  DocsContainer,
  Primary,
  Stories,
  Subtitle,
  Title,
} from '@storybook/addon-docs/blocks';
import { useDarkMode } from '@vueless/storybook-dark-mode';

import { dayoptDarkTheme, dayoptLightTheme } from './dayopt';

export function DocsTemplate() {
  return (
    <div className="prose dark:prose-invert mx-auto max-w-4xl">
      <Title />
      <Subtitle />
      <Description />
      <Primary />
      <Controls />
      <Stories includePrimary={false} />
    </div>
  );
}

type DocsContainerProps = ComponentProps<typeof DocsContainer>;

export function ThemedDocsContainer({ children, ...props }: DocsContainerProps) {
  const isDark = useDarkMode();

  return (
    <DocsContainer {...props} theme={isDark ? dayoptDarkTheme : dayoptLightTheme}>
      {children}
    </DocsContainer>
  );
}
