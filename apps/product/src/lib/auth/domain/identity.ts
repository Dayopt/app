import type { ProductRole } from './roles';

export type ProductIdentity = {
  userId: string;
  role?: ProductRole | null;
  subscriptionStatus?: string | null;
};
