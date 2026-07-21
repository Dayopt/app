import type { LegalDocumentSlug } from '../_lib/legal-content';

export function shouldShowLegalReviewWarning(
  nodeEnv: string | undefined,
  slug: LegalDocumentSlug,
): boolean {
  return nodeEnv === 'development' && slug !== 'security';
}

export function getLegalReviewWarningItemKeys(slug: LegalDocumentSlug): string[] {
  return slug === 'tokushoho' ? ['lawyer', 'update', 'placeholder'] : ['lawyer', 'update'];
}
