export type ColorToken = {
  readonly value: string;
  readonly darkValue?: string;
  readonly cssVariable: `--dayopt-color-${string}`;
  readonly description: string;
};

export const colors = {
  background: {
    value: 'oklch(0.98 0 0)',
    darkValue: 'oklch(0.18 0.008 60)',
    cssVariable: '--dayopt-color-background',
    description: 'Default page background.',
  },
  foreground: {
    value: 'oklch(0.13 0 0)',
    darkValue: 'oklch(0.9 0.005 70)',
    cssVariable: '--dayopt-color-foreground',
    description: 'Default high-emphasis text.',
  },
  container: {
    value: 'oklch(0.96 0 0)',
    darkValue: 'oklch(0.15 0.008 60)',
    cssVariable: '--dayopt-color-container',
    description: 'Recessed surface for sidebars and sections.',
  },
  card: {
    value: 'oklch(1 0 0)',
    darkValue: 'oklch(0.22 0.008 60)',
    cssVariable: '--dayopt-color-card',
    description: 'Raised surface for cards, dialogs, and popovers.',
  },
  muted: {
    value: 'oklch(0.95 0 0)',
    darkValue: 'oklch(0.25 0.008 60)',
    cssVariable: '--dayopt-color-muted',
    description: 'Subtle well/input surface.',
  },
  mutedForeground: {
    value: 'oklch(0.4 0 0)',
    darkValue: 'oklch(0.68 0.005 60)',
    cssVariable: '--dayopt-color-muted-foreground',
    description: 'Lower-emphasis text.',
  },
  primary: {
    value: 'oklch(0.45 0.14 259.8145)',
    darkValue: 'oklch(0.5 0.188 259.8145)',
    cssVariable: '--dayopt-color-primary',
    description: 'Brand action color.',
  },
  primaryForeground: {
    value: 'oklch(1 0 0)',
    darkValue: 'oklch(1 0 0)',
    cssVariable: '--dayopt-color-primary-foreground',
    description: 'Text on primary fills.',
  },
  destructive: {
    value: 'oklch(0.54 0.18 25)',
    darkValue: 'oklch(0.65 0.14 25)',
    cssVariable: '--dayopt-color-destructive',
    description: 'Error and destructive accents.',
  },
  destructiveTint: {
    value: 'oklch(0.96 0.015 25)',
    darkValue: 'oklch(0.22 0.03 25)',
    cssVariable: '--dayopt-color-destructive-tint',
    description: 'Subtle destructive background.',
  },
  warning: {
    value: 'oklch(0.55 0.16 70)',
    darkValue: 'oklch(0.72 0.14 70)',
    cssVariable: '--dayopt-color-warning',
    description: 'Warning accents.',
  },
  warningTint: {
    value: 'oklch(0.97 0.015 70)',
    darkValue: 'oklch(0.22 0.03 70)',
    cssVariable: '--dayopt-color-warning-tint',
    description: 'Subtle warning background.',
  },
  success: {
    value: 'oklch(0.5 0.15 150)',
    darkValue: 'oklch(0.65 0.12 150)',
    cssVariable: '--dayopt-color-success',
    description: 'Success accents.',
  },
  successTint: {
    value: 'oklch(0.95 0.02 150)',
    darkValue: 'oklch(0.22 0.03 150)',
    cssVariable: '--dayopt-color-success-tint',
    description: 'Subtle success background.',
  },
  info: {
    value: 'oklch(0.55 0.02 260)',
    darkValue: 'oklch(0.65 0.02 260)',
    cssVariable: '--dayopt-color-info',
    description: 'Informational accents.',
  },
  infoTint: {
    value: 'oklch(0.96 0.005 260)',
    darkValue: 'oklch(0.22 0.01 260)',
    cssVariable: '--dayopt-color-info-tint',
    description: 'Subtle informational background.',
  },
  border: {
    value: 'oklch(0 0 0 / 0.12)',
    darkValue: 'oklch(1 0 0 / 0.12)',
    cssVariable: '--dayopt-color-border',
    description: 'Default border.',
  },
  borderSubtle: {
    value: 'oklch(0 0 0 / 0.06)',
    darkValue: 'oklch(1 0 0 / 0.07)',
    cssVariable: '--dayopt-color-border-subtle',
    description: 'Low-emphasis divider.',
  },
  input: {
    value: 'oklch(0 0 0 / 0.06)',
    darkValue: 'oklch(1 0 0 / 0.08)',
    cssVariable: '--dayopt-color-input',
    description: 'Input background.',
  },
  ring: {
    value: 'oklch(0.45 0.14 259.8145)',
    darkValue: 'oklch(0.5 0.188 259.8145)',
    cssVariable: '--dayopt-color-ring',
    description: 'Focus ring.',
  },
} as const satisfies Record<string, ColorToken>;
