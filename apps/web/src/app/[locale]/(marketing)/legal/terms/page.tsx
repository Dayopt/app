import type { Locale } from '@dayopt/i18n/routing';
import type { Metadata } from 'next';

import { LegalDocument } from '../_components/LegalDocument';
import { getLegalDocument } from '../_lib/legal-content';

export const revalidate = 86400;

interface PageProps {
  params: Promise<{ locale?: Locale }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale = 'ja' } = await params;
  const { frontMatter } = getLegalDocument(locale, 'terms');
  return {
    title: `${frontMatter.title} - Dayopt`,
    description: frontMatter.description,
  };
}

export default async function TermsOfServicePage({ params }: PageProps) {
  const { locale = 'ja' } = await params;
  return <LegalDocument locale={locale} slug="terms" />;
}
