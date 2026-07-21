import type { MDXComponents } from 'mdx/types';

import { CookieDocument } from './legal-cookie-document';
import { SecurityDocument } from './legal-security-document';
import { PrivacyDocument, TermsDocument } from './legal-standard-document';
import { TokushohoDocument } from './legal-tokushoho-document';

export const legalMdxComponents = {
  CookieDocument,
  PrivacyDocument,
  SecurityDocument,
  TermsDocument,
  TokushohoDocument,
} as MDXComponents;
