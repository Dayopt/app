export function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === 'string') {
    return new Error(error);
  }

  if (typeof error === 'object' && error !== null) {
    try {
      return new Error(JSON.stringify(error));
    } catch {
      return new Error('[Unstringifiable Error Object]');
    }
  }

  return new Error(String(error));
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (typeof error === 'object' && error !== null) {
    try {
      return JSON.stringify(error);
    } catch {
      return '[Unstringifiable Error]';
    }
  }

  if (error === null || error === undefined) {
    return 'Unknown error';
  }

  return String(error);
}
