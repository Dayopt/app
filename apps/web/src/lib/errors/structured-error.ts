import { isDevelopment } from '@web/platform/config/env';

import { toError } from './normalize-error';

export enum ErrorCategory {
  NETWORK = 'NETWORK',
  FILESYSTEM = 'FILESYSTEM',
  VALIDATION = 'VALIDATION',
  EXTERNAL_SERVICE = 'EXTERNAL_SERVICE',
  INTERNAL = 'INTERNAL',
  USER = 'USER',
}

export enum ErrorLevel {
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  FATAL = 'FATAL',
}

export interface StructuredError {
  message: string;
  category: ErrorCategory;
  level: ErrorLevel;
  context?: string;
  originalError?: unknown;
  timestamp: Date;
  stack?: string;
}

export function createStructuredError(
  message: string,
  category: ErrorCategory,
  level: ErrorLevel = ErrorLevel.ERROR,
  context?: string,
  originalError?: unknown,
): StructuredError {
  const error = originalError ? toError(originalError) : undefined;

  return {
    message,
    category,
    level,
    context,
    originalError,
    timestamp: new Date(),
    stack: isDevelopment && error ? error.stack : undefined,
  };
}

export function logError(structuredError: StructuredError): void {
  const { message, category, level, context, originalError, timestamp, stack } = structuredError;
  const prefix = context ? `[${context}]` : `[${category}]`;
  const fullMessage = `${prefix} ${message}`;

  switch (level) {
    case ErrorLevel.INFO:
      console.log(fullMessage);
      break;
    case ErrorLevel.WARN:
      console.warn(fullMessage);
      break;
    case ErrorLevel.ERROR:
    case ErrorLevel.FATAL:
      console.error(fullMessage);
      break;
  }

  if (isDevelopment) {
    if (originalError) {
      console.error('Original error:', originalError);
    }
    if (stack) {
      console.error('Stack trace:', stack);
    }
    console.error('Timestamp:', timestamp.toISOString());
  }
}
