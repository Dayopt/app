import * as a11yAddonAnnotations from '@storybook/addon-a11y/preview';
import { setProjectAnnotations } from '@storybook/nextjs-vite';
import { beforeEach } from 'vitest';
import * as projectAnnotations from './preview';

setProjectAnnotations([a11yAddonAnnotations, projectAnnotations]);

// vitest headless では useDarkMode() が常に false を返すため、
// beforeEach で直接 .dark クラスをセットして CSS トークンを dark mode にする
beforeEach(() => {
  document.documentElement.classList.remove('light');
  document.documentElement.classList.add('dark');
  document.documentElement.style.colorScheme = 'dark';
});
