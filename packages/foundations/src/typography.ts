export const typography = {
  fontFamily: {
    sans: {
      value: 'Inter, Noto Sans JP, system-ui, sans-serif',
      cssVariable: '--dayopt-font-sans',
    },
    inter: {
      value: 'Inter, system-ui, sans-serif',
      cssVariable: '--dayopt-font-inter',
    },
    notoJp: {
      value: 'Noto Sans JP, system-ui, sans-serif',
      cssVariable: '--dayopt-font-noto-jp',
    },
  },
  fontSize: {
    xs: { value: '0.75rem', px: 12, cssVariable: '--dayopt-font-size-xs' },
    sm: { value: '0.875rem', px: 14, cssVariable: '--dayopt-font-size-sm' },
    base: { value: '1rem', px: 16, cssVariable: '--dayopt-font-size-base' },
    lg: { value: '1.125rem', px: 18, cssVariable: '--dayopt-font-size-lg' },
    xl: { value: '1.25rem', px: 20, cssVariable: '--dayopt-font-size-xl' },
    '2xl': { value: '1.5rem', px: 24, cssVariable: '--dayopt-font-size-2xl' },
    '3xl': { value: '1.875rem', px: 30, cssVariable: '--dayopt-font-size-3xl' },
    '4xl': { value: '2.25rem', px: 36, cssVariable: '--dayopt-font-size-4xl' },
  },
  fontWeight: {
    normal: { value: 400, cssVariable: '--dayopt-font-weight-normal' },
    medium: { value: 500, cssVariable: '--dayopt-font-weight-medium' },
  },
  lineHeight: {
    tight: { value: 1.2, cssVariable: '--dayopt-line-height-tight' },
    normal: { value: 1.5, cssVariable: '--dayopt-line-height-normal' },
    relaxed: { value: 1.75, cssVariable: '--dayopt-line-height-relaxed' },
  },
} as const;
