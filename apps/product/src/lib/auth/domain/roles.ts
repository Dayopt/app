export const productRoles = ['user', 'admin'] as const;

export type ProductRole = (typeof productRoles)[number];
