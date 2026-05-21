export const shadow = {
  xs: {
    value: '0 1px 2px oklch(0 0 0 / 0.04)',
    darkValue: '0 1px 2px oklch(0 0 0 / 0.14)',
    cssVariable: '--dayopt-shadow-xs',
  },
  sm: {
    value: '0 0 0 1px oklch(0 0 0 / 0.03), 0 1px 3px oklch(0 0 0 / 0.03)',
    darkValue: '0 0 0 1px oklch(1 0 0 / 0.03), 0 1px 4px oklch(0 0 0 / 0.18)',
    cssVariable: '--dayopt-shadow-sm',
  },
  card: {
    value:
      '0 0 0 1px oklch(0 0 0 / 0.03), 0 1px 2px oklch(0 0 0 / 0.04), 0 4px 16px oklch(0 0 0 / 0.05)',
    darkValue: '0 0 0 1px oklch(1 0 0 / 0.04), 0 2px 8px oklch(0 0 0 / 0.25)',
    cssVariable: '--dayopt-shadow-card',
  },
  elevationSunken: {
    value: 'inset 0 2px 4px 0 oklch(0 0 0 / 0.08), inset 0 1px 2px 0 oklch(0 0 0 / 0.06)',
    cssVariable: '--dayopt-shadow-elevation-sunken',
  },
  elevationRaised: {
    value:
      'inset 0 1px 0 0 oklch(1 0 0 / 0.07), 0 1px 3px 0 oklch(0 0 0 / 0.1), 0 4px 8px -2px oklch(0 0 0 / 0.1)',
    darkValue:
      'inset 0 1px 0 0 oklch(1 0 0 / 0.05), 0 1px 3px 0 oklch(0 0 0 / 0.2), 0 4px 8px -2px oklch(0 0 0 / 0.25)',
    cssVariable: '--dayopt-shadow-elevation-raised',
  },
} as const;
