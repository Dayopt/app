export const productRoles = ['user', 'admin'] as const;

export type ProductRole = (typeof productRoles)[number];

export function isProductRole(value: string | null | undefined): value is ProductRole {
  return productRoles.includes(value as ProductRole);
}

export function isAdminRole(role: ProductRole | null | undefined): role is 'admin' {
  return role === 'admin';
}
