import * as Sentry from '@sentry/nextjs';

import {
  sanitizeBreadcrumbEvent,
  sanitizeErrorEvent,
  sanitizeSpanEvent,
  sanitizeTransactionEvent,
} from './src/platform/observability/sentry-sanitizers';

const isProduction = process.env.VERCEL_ENV === 'production';
const dsn = process.env.SENTRY_DSN;
if (isProduction && dsn) {
  Sentry.init({
    dsn,
    enabled: true,
    environment: 'production',
    sendDefaultPii: false,
    tracesSampler: ({ inheritOrSampleWith }) => inheritOrSampleWith(0.1),
    integrations: [Sentry.extraErrorDataIntegration({ depth: 3 })],
    beforeSend: (event, hint) => sanitizeErrorEvent(event, hint),
    beforeSendTransaction: (event) => sanitizeTransactionEvent(event),
    beforeSendSpan: (span) => sanitizeSpanEvent(span),
    beforeBreadcrumb: (breadcrumb) => sanitizeBreadcrumbEvent(breadcrumb),
  });
}
