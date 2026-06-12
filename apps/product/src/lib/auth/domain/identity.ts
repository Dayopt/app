import type { ProductRole } from './roles';

/** @public Shared identity shape exported by the auth domain barrel. */
export type ProductIdentity = {
  userId: string;
  role?: ProductRole | null;
  subscriptionStatus?: string | null;
};
