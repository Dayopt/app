import * as Sentry from '@sentry/nextjs';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const SMOKE_BASE_PATH = '/api/v1/system/sentry-smoke';

type WebOperatorSmokeSurface = 'browser' | 'server';

interface WebOperatorSmokeResult {
  ok: boolean;
  surface: WebOperatorSmokeSurface | 'invalid';
  eventId?: string;
  runtime?: string;
  flushed?: boolean;
}

interface WebOperatorSmokeInput {
  token: string;
  surface: WebOperatorSmokeSurface;
}

declare global {
  interface Window {
    __DAYOPT_WEB_SENTRY_SMOKE__?: (input: unknown) => Promise<WebOperatorSmokeResult>;
  }
}

function authorization(token: string): string {
  return `Bearer ${token}`;
}

async function authorizeBrowserSmoke(token: string): Promise<void> {
  const response = await fetch(`${SMOKE_BASE_PATH}/browser`, {
    method: 'POST',
    headers: { Authorization: authorization(token) },
    cache: 'no-store',
    credentials: 'omit',
    redirect: 'error',
  });

  if (response.status !== 204) throw new Error('Operator smoke authorization failed');
}

async function captureBrowserSmoke(token: string): Promise<WebOperatorSmokeResult> {
  await authorizeBrowserSmoke(token);

  let eventId = '';
  await Sentry.startNewTrace(() =>
    Sentry.startSpan(
      {
        name: 'operator.sentry_smoke.browser',
        op: 'test.observability',
        forceTransaction: true,
      },
      () => {
        const error = new Error('Dayopt Web operator browser Sentry smoke');
        error.name = 'WebOperatorBrowserSmokeError';
        eventId = Sentry.withScope((scope) => {
          scope.setTags({
            feature: 'observability',
            operation: 'operator_sentry_smoke_browser',
            route: '/browser',
            runtime: 'browser',
          });
          return Sentry.captureException(error);
        });
      },
    ),
  );
  const flushed = await Sentry.flush(5_000);
  if (!flushed) throw new Error('Operator smoke flush failed');
  return { ok: true, surface: 'browser', eventId, flushed };
}

async function captureServerSmoke(token: string): Promise<WebOperatorSmokeResult> {
  const response = await fetch(`${SMOKE_BASE_PATH}/server`, {
    method: 'POST',
    headers: { Authorization: authorization(token) },
    cache: 'no-store',
    credentials: 'omit',
    redirect: 'error',
  });

  if (response.status !== 202) throw new Error('Operator smoke request failed');
  const result = (await response.json()) as {
    eventId?: unknown;
    flushed?: unknown;
    runtime?: unknown;
  };
  if (
    typeof result.eventId !== 'string' ||
    result.flushed !== true ||
    result.runtime !== 'server'
  ) {
    throw new Error('Operator smoke response invalid');
  }
  return {
    ok: true,
    surface: 'server',
    eventId: result.eventId,
    flushed: true,
    runtime: 'server',
  };
}

function isWebOperatorSmokeInput(input: unknown): input is WebOperatorSmokeInput {
  if (input === null || typeof input !== 'object') return false;
  const candidate = input as { token?: unknown; surface?: unknown };
  return (
    typeof candidate.token === 'string' &&
    TOKEN_PATTERN.test(candidate.token) &&
    (candidate.surface === 'browser' || candidate.surface === 'server')
  );
}

async function runWebOperatorSmoke(input: unknown): Promise<WebOperatorSmokeResult> {
  if (!isWebOperatorSmokeInput(input)) return { ok: false, surface: 'invalid' };

  try {
    return input.surface === 'browser'
      ? await captureBrowserSmoke(input.token)
      : await captureServerSmoke(input.token);
  } catch {
    return { ok: false, surface: input.surface };
  }
}

export function installWebOperatorSentrySmoke(): void {
  if (typeof window === 'undefined') return;

  Object.defineProperty(window, '__DAYOPT_WEB_SENTRY_SMOKE__', {
    configurable: true,
    enumerable: false,
    value: runWebOperatorSmoke,
    writable: false,
  });
}

export function uninstallWebOperatorSentrySmoke(): void {
  if (typeof window !== 'undefined') delete window.__DAYOPT_WEB_SENTRY_SMOKE__;
}
