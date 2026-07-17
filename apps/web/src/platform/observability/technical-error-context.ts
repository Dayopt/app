import type { TechnicalErrorContext } from '@dayopt/observability';
import { sanitizeTechnicalContext } from '@dayopt/observability';

type RequestHeaders = Headers | Record<string, string | string[] | undefined>;

/** Convert allowlisted technical context into Sentry tag primitives. */
export function createTechnicalErrorTags(context: TechnicalErrorContext): Record<string, string> {
  const tags: Record<string, string> = {};
  for (const [key, value] of Object.entries(sanitizeTechnicalContext({ ...context }))) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      tags[key] = String(value);
    }
  }
  return tags;
}

/** Read only an infrastructure-generated, technically shaped request identifier. */
export function resolveTechnicalRequestId(headers: RequestHeaders): string | undefined {
  const rawValue =
    headers instanceof Headers
      ? headers.get('x-vercel-id')
      : Object.entries(headers).find(([key]) => key.toLowerCase() === 'x-vercel-id')?.[1];
  const candidate = (Array.isArray(rawValue) ? rawValue[0] : rawValue)?.trim();
  if (candidate && candidate.length <= 128 && /^[A-Za-z0-9_.:-]+$/u.test(candidate)) {
    return candidate;
  }
  return undefined;
}
