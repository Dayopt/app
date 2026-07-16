import {
  authorizeProductOperatorSmoke,
  OPERATOR_SMOKE_RESPONSE_HEADERS,
  operatorSmokeUnavailableResponse,
} from '@/lib/sentry/operator-smoke-auth';
import { captureProductOperatorSmoke } from '@/lib/sentry/operator-smoke-capture';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface RouteContext {
  params: Promise<{ surface: string }>;
}

export async function POST(request: Request, { params }: RouteContext): Promise<Response> {
  const { surface } = await params;
  if (surface !== 'browser' && surface !== 'server') {
    return operatorSmokeUnavailableResponse();
  }

  const authorization = await authorizeProductOperatorSmoke(request);
  if (!authorization.authorized) return authorization.response;

  if (surface === 'browser') {
    return new Response(null, {
      status: 204,
      headers: OPERATOR_SMOKE_RESPONSE_HEADERS,
    });
  }

  return captureProductOperatorSmoke('server');
}

export function GET(): Response {
  return operatorSmokeUnavailableResponse();
}

export function OPTIONS(): Response {
  return operatorSmokeUnavailableResponse();
}
