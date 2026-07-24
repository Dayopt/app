const EXPECTED_CONTEXT_CODES = new Set(['RANGE_TOO_DENSE', 'CONTEXT_CHANGED', 'REQUEST_CANCELLED']);

export function findMcpContextReadErrorCode(error: unknown): string | null {
  const seen = new WeakSet<Error>();
  let current = error;

  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    if (
      'code' in current &&
      typeof (current as { code: unknown }).code === 'string' &&
      EXPECTED_CONTEXT_CODES.has((current as { code: string }).code)
    ) {
      return (current as { code: string }).code;
    }
    current = current.cause;
  }

  return null;
}
