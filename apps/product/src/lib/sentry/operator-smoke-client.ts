import * as Sentry from '@sentry/nextjs';

import type { OperatorSmokeRouter } from './operator-smoke-router';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const SMOKE_BASE_PATH = '/api/v1/system/sentry-smoke';

type ProductOperatorSmokeSurface = 'browser' | 'server' | 'edge' | 'trpc';

interface ProductOperatorSmokeResult {
  ok: boolean;
  surface: ProductOperatorSmokeSurface | 'invalid';
  eventId?: string;
  runtime?: string;
  flushed?: boolean;
}

interface ProductOperatorSmokeInput {
  token: string;
  surface: ProductOperatorSmokeSurface;
}

declare global {
  interface Window {
    __DAYOPT_PRODUCT_SENTRY_SMOKE__?: (input: unknown) => Promise<ProductOperatorSmokeResult>;
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

async function captureBrowserSmoke(token: string): Promise<ProductOperatorSmokeResult> {
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
        const error = new Error('Dayopt Product operator browser Sentry smoke');
        error.name = 'ProductOperatorBrowserSmokeError';
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

async function captureRemoteSmoke(
  token: string,
  surface: 'server' | 'edge',
): Promise<ProductOperatorSmokeResult> {
  const response = await fetch(`${SMOKE_BASE_PATH}/${surface}`, {
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
    typeof result.runtime !== 'string'
  ) {
    throw new Error('Operator smoke response invalid');
  }
  return { ok: true, surface, eventId: result.eventId, flushed: true, runtime: result.runtime };
}

async function captureTrpcSmoke(token: string): Promise<ProductOperatorSmokeResult> {
  const { createTRPCProxyClient, httpLink, TRPCClientError } = await import('@trpc/client');
  const client = createTRPCProxyClient<OperatorSmokeRouter>({
    links: [
      httpLink({
        url: `${SMOKE_BASE_PATH}/trpc`,
        headers: { Authorization: authorization(token) },
        fetch: (input, init) => {
          const request =
            input instanceof Request ? input : new Request(input, init as RequestInit);
          return fetch(new Request(request, { credentials: 'omit', redirect: 'error' }));
        },
      }),
    ],
  });

  try {
    await client.capture.mutate();
  } catch (error) {
    if (error instanceof TRPCClientError && error.data?.code === 'INTERNAL_SERVER_ERROR') {
      return { ok: true, surface: 'trpc' };
    }
    throw new Error('Operator tRPC smoke request failed');
  }

  throw new Error('Operator tRPC smoke did not capture an error');
}

function isProductOperatorSmokeInput(input: unknown): input is ProductOperatorSmokeInput {
  if (input === null || typeof input !== 'object') return false;
  const candidate = input as { token?: unknown; surface?: unknown };
  return (
    typeof candidate.token === 'string' &&
    TOKEN_PATTERN.test(candidate.token) &&
    (candidate.surface === 'browser' ||
      candidate.surface === 'server' ||
      candidate.surface === 'edge' ||
      candidate.surface === 'trpc')
  );
}

async function runProductOperatorSmoke(input: unknown): Promise<ProductOperatorSmokeResult> {
  if (!isProductOperatorSmokeInput(input)) return { ok: false, surface: 'invalid' };

  try {
    switch (input.surface) {
      case 'browser':
        return await captureBrowserSmoke(input.token);
      case 'server':
      case 'edge':
        return await captureRemoteSmoke(input.token, input.surface);
      case 'trpc':
        return await captureTrpcSmoke(input.token);
    }
  } catch {
    return { ok: false, surface: input.surface };
  }
}

export function installProductOperatorSentrySmoke(): void {
  if (typeof window === 'undefined') return;

  Object.defineProperty(window, '__DAYOPT_PRODUCT_SENTRY_SMOKE__', {
    configurable: true,
    enumerable: false,
    value: runProductOperatorSmoke,
    writable: false,
  });
}

export function uninstallProductOperatorSentrySmoke(): void {
  if (typeof window !== 'undefined') delete window.__DAYOPT_PRODUCT_SENTRY_SMOKE__;
}
