import 'server-only';

import * as Sentry from '@sentry/nextjs';

import {
  OPERATOR_SMOKE_RESPONSE_HEADERS,
  operatorSmokeUnavailableResponse,
} from './operator-smoke-auth';

class WebOperatorServerSmokeError extends Error {
  constructor() {
    super('Dayopt Web operator Sentry smoke');
    this.name = 'WebOperatorServerSmokeError';
  }
}

export async function captureWebOperatorServerSmoke(): Promise<Response> {
  const route = '/api/v1/system/sentry-smoke/server';
  let eventId = '';

  await Sentry.startNewTrace(() =>
    Sentry.startSpan(
      {
        name: 'operator.sentry_smoke.server',
        op: 'test.observability',
        forceTransaction: true,
      },
      () => {
        const error = new WebOperatorServerSmokeError();
        eventId = Sentry.withScope((scope) => {
          scope.setTags({
            feature: 'observability',
            operation: 'operator_sentry_smoke_server',
            route,
            runtime: 'server',
          });
          return Sentry.captureException(error);
        });
      },
    ),
  );
  const flushed = await Sentry.flush(5_000);
  if (!flushed) return operatorSmokeUnavailableResponse(503);

  return Response.json(
    { eventId, flushed, runtime: 'server' },
    { status: 202, headers: OPERATOR_SMOKE_RESPONSE_HEADERS },
  );
}
