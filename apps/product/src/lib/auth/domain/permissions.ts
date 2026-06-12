export const productAccessLevels = ['public', 'protected', 'pro', 'admin'] as const;

export type ProductAccessLevel = (typeof productAccessLevels)[number];
