import {
  BROWSER_TELEMETRY_CONSENT_EVENT,
  getBrowserTelemetryConsentStorage,
  hasAnalyticsConsent,
  isBrowserTelemetryConsentStorageChange,
  resolveAnalyticsConsentDetail,
} from '@dayopt/observability';
import * as Sentry from '@sentry/nextjs';

import {
  sanitizeBreadcrumbEvent,
  sanitizeErrorEvent,
  sanitizeSpanEvent,
  sanitizeTransactionEvent,
} from './src/platform/observability/sentry-sanitizers';

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const isProduction = process.env.NEXT_PUBLIC_VERCEL_ENV === 'production';
let initialized = false;
let browserTelemetryAllowed = false;
let revocationReloadRequested = false;

function hasStoredAnalyticsConsent(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    return hasAnalyticsConsent(getBrowserTelemetryConsentStorage());
  } catch {
    return false;
  }
}

function initializeBrowserSentry(): void {
  if (
    initialized ||
    !browserTelemetryAllowed ||
    !isProduction ||
    !dsn ||
    !hasStoredAnalyticsConsent()
  ) {
    return;
  }

  initialized = true;

  Sentry.init({
    dsn,
    enabled: true,
    environment: 'production',
    sendDefaultPii: false,
    tracesSampler: ({ inheritOrSampleWith }) => inheritOrSampleWith(0.1),
    integrations: [Sentry.browserTracingIntegration({ enableInp: true })],
    beforeSend: (event, hint) => sanitizeErrorEvent(event, hint),
    beforeSendTransaction: (event) => sanitizeTransactionEvent(event),
    beforeSendSpan: (span) => sanitizeSpanEvent(span),
    beforeBreadcrumb: (breadcrumb) => sanitizeBreadcrumbEvent(breadcrumb),
  });
}

function setSentryClientEnabled(enabled: boolean): void {
  const client = Sentry.getClient();
  if (client) client.getOptions().enabled = enabled;
}

function applyBrowserTelemetryConsent(allowed: boolean): void {
  browserTelemetryAllowed = allowed && hasStoredAnalyticsConsent();

  if (!browserTelemetryAllowed) {
    setSentryClientEnabled(false);
    if (initialized && !revocationReloadRequested) {
      revocationReloadRequested = true;
      try {
        window.location.reload();
      } catch {
        // The client stays disabled and cannot be re-enabled in this document.
      }
    }
    return;
  }

  if (revocationReloadRequested) return;

  if (initialized) {
    setSentryClientEnabled(true);
  } else {
    initializeBrowserSentry();
  }
}

if (isProduction && dsn && typeof window !== 'undefined') {
  browserTelemetryAllowed = hasStoredAnalyticsConsent();

  if (browserTelemetryAllowed) {
    initializeBrowserSentry();
  }

  const handleConsent = (event: Event) => {
    const analyticsConsent = resolveAnalyticsConsentDetail((event as CustomEvent<unknown>).detail);
    if (analyticsConsent === null) return;

    applyBrowserTelemetryConsent(analyticsConsent);
  };
  const handleStorage = (event: StorageEvent) => {
    if (!isBrowserTelemetryConsentStorageChange(event.key)) return;
    applyBrowserTelemetryConsent(hasStoredAnalyticsConsent());
  };

  window.addEventListener(BROWSER_TELEMETRY_CONSENT_EVENT, handleConsent);
  window.addEventListener('storage', handleStorage);
}
