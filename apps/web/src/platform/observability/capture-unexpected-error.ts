import type { TechnicalErrorContext } from '@dayopt/observability';
import * as Sentry from '@sentry/nextjs';

import { createTechnicalErrorTags } from './technical-error-context';

const capturedErrors = new WeakSet<Error>();
const normalizedErrorObjects = new WeakMap<object, Error>();

function normalizeUnexpectedWebError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (error !== null && (typeof error === 'object' || typeof error === 'function')) {
    const cached = normalizedErrorObjects.get(error);
    if (cached) return cached;
    const normalized = new Error('Unexpected Web failure', { cause: error });
    normalizedErrorObjects.set(error, normalized);
    return normalized;
  }
  return new Error('Unexpected Web failure');
}

/** Capture one unexpected Web error with technical, allowlisted scope only. */
export function captureUnexpectedWebError(error: unknown, context: TechnicalErrorContext): Error {
  const original = normalizeUnexpectedWebError(error);
  if (capturedErrors.has(original)) return original;
  capturedErrors.add(original);

  const tags = createTechnicalErrorTags(context);
  Sentry.withScope((scope) => {
    scope.setTags(tags);
    Sentry.captureException(original);
  });
  return original;
}
