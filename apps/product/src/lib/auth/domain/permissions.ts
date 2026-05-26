import { canAccessAdminFeatures, canAccessProFeatures } from './access-policy';
import type { ProductIdentity } from './identity';

export const productAccessLevels = ['public', 'protected', 'pro', 'admin'] as const;

export type ProductAccessLevel = (typeof productAccessLevels)[number];

export const productPermissions = ['access:protected', 'access:pro', 'access:admin'] as const;

export type ProductPermission = (typeof productPermissions)[number];

export function isProductAccessLevel(
  value: string | null | undefined,
): value is ProductAccessLevel {
  return productAccessLevels.includes(value as ProductAccessLevel);
}

export function hasProductPermission(
  identity: ProductIdentity | null | undefined,
  permission: ProductPermission,
): boolean {
  if (!identity?.userId) {
    return false;
  }

  switch (permission) {
    case 'access:protected':
      return true;
    case 'access:pro':
      return canAccessProFeatures(identity.subscriptionStatus);
    case 'access:admin':
      return canAccessAdminFeatures(identity.role);
  }
}
