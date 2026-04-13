import { addons } from 'storybook/manager-api';

import { dayoptDarkTheme, dayoptLightTheme } from './theme/dayopt';

const isDark =
  typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;

addons.setConfig({
  theme: isDark ? dayoptDarkTheme : dayoptLightTheme,
  selectedPanel: 'storybook/controls',
  toolbar: {
    // position: fixed要素がtransform: scaleで壊れる問題を回避
    // https://github.com/storybookjs/storybook/issues/23586
    zoom: { hidden: true },
  },
});
