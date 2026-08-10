import type { LegalDocumentSlug } from '../_lib/legal-content';

export function shouldShowLegalReviewWarning(
  nodeEnv: string | undefined,
  slug: LegalDocumentSlug,
): boolean {
  return nodeEnv === 'development' && slug !== 'security';
}

/** legal.reviewWarning.items 配下の item key（`legal.json` の実キーと一致させる） */
type LegalReviewWarningItemKey = 'lawyer' | 'update' | 'placeholder';

export function getLegalReviewWarningItemKeys(
  slug: LegalDocumentSlug,
): LegalReviewWarningItemKey[] {
  return slug === 'tokushoho' ? ['lawyer', 'update', 'placeholder'] : ['lawyer', 'update'];
}
