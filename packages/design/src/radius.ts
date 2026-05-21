export const radius = {
  none: { value: '0', px: 0, cssVariable: '--dayopt-radius-none' },
  sm: { value: '0.25rem', px: 4, cssVariable: '--dayopt-radius-sm' },
  md: { value: '0.5rem', px: 8, cssVariable: '--dayopt-radius-md' },
  lg: { value: '1rem', px: 16, cssVariable: '--dayopt-radius-lg' },
  xl: { value: '1.5rem', px: 24, cssVariable: '--dayopt-radius-xl' },
  full: { value: '9999px', px: null, cssVariable: '--dayopt-radius-full' },
} as const;
