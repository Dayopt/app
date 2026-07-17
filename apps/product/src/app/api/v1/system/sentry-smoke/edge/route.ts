import {
  authorizeProductOperatorSmoke,
  operatorSmokeUnavailableResponse,
} from '@/lib/sentry/operator-smoke-auth';
import { captureProductOperatorSmoke } from '@/lib/sentry/operator-smoke-capture';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: Request): Promise<Response> {
  const authorization = await authorizeProductOperatorSmoke(request);
  if (!authorization.authorized) return authorization.response;

  return captureProductOperatorSmoke('edge');
}

export function GET(): Response {
  return operatorSmokeUnavailableResponse();
}

export function OPTIONS(): Response {
  return operatorSmokeUnavailableResponse();
}
