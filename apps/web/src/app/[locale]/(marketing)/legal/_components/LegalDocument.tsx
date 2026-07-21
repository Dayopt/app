import type { Locale } from '@dayopt/i18n/routing';
import { Shield } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { MDXRemote } from 'next-mdx-remote/rsc';

import { getLegalDocument, type LegalDocumentSlug } from '../_lib/legal-content';
import { legalMdxComponents } from './legal-mdx-components';
import { LEGAL_MDX_OPTIONS } from './legal-mdx-options';
import {
  getLegalReviewWarningItemKeys,
  shouldShowLegalReviewWarning,
} from './legal-review-warning';

interface LegalDocumentProps {
  locale: Locale;
  slug: LegalDocumentSlug;
}

interface LegalReviewWarningContent {
  title: string;
  description: string;
  items: string[];
}

async function getReviewWarning(
  locale: Locale,
  slug: LegalDocumentSlug,
): Promise<LegalReviewWarningContent | null> {
  if (!shouldShowLegalReviewWarning(process.env.NODE_ENV, slug)) {
    return null;
  }

  const t = await getTranslations({ locale, namespace: 'legal.reviewWarning' });
  return {
    title: t('title'),
    description: t('description'),
    items: getLegalReviewWarningItemKeys(slug).map((key) => t(`items.${key}`)),
  };
}

function LegalReviewWarning({
  content,
  compact,
}: {
  content: LegalReviewWarningContent;
  compact: boolean;
}) {
  const className = compact
    ? 'bg-muted border-destructive mt-8 rounded-2xl border-2 p-6'
    : 'bg-muted border-destructive mt-12 rounded-2xl border-2 p-6';

  return (
    <div className={className} data-legal-review-warning>
      <div className="flex items-start gap-4">
        <span className="text-2xl">⚠️</span>
        <div>
          <p className="text-destructive font-medium">{content.title}</p>
          <p className="text-muted-foreground mt-1 text-sm">{content.description}</p>
          <ul className="text-muted-foreground mt-2 list-inside list-disc text-sm">
            {content.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export async function LegalDocument({ locale, slug }: LegalDocumentProps) {
  const { frontMatter, content } = getLegalDocument(locale, slug);
  const reviewWarning = await getReviewWarning(locale, slug);
  const isSecurity = slug === 'security';

  return (
    <div className="bg-background container mx-auto min-h-screen max-w-4xl px-4 py-12 md:px-8 md:py-16">
      {isSecurity ? (
        <div className="mb-8">
          <div className="mb-4 flex items-center gap-4">
            <Shield className="text-primary size-10" />
            <h1 className="text-3xl font-medium">{frontMatter.title}</h1>
          </div>
          <p className="text-muted-foreground">{frontMatter.description}</p>
        </div>
      ) : (
        <div className="mb-8">
          <h1 className="mb-2 text-3xl font-medium">{frontMatter.title}</h1>
          <p className="text-muted-foreground">{frontMatter.description}</p>
          <p className="text-muted-foreground mt-2 text-sm">{frontMatter.lastUpdated}</p>
        </div>
      )}

      <MDXRemote source={content} components={legalMdxComponents} options={LEGAL_MDX_OPTIONS} />

      {reviewWarning ? (
        <LegalReviewWarning content={reviewWarning} compact={slug === 'tokushoho'} />
      ) : null}

      {isSecurity ? (
        <div className="text-muted-foreground mt-8 text-center text-sm">
          <p>{frontMatter.lastUpdated}</p>
        </div>
      ) : null}
    </div>
  );
}
