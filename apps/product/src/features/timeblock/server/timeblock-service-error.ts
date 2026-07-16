import { ServiceError } from '@/lib/trpc/errors';

export class TimeblockServiceError extends ServiceError {
  constructor(code: string, message: string, options?: ErrorOptions) {
    super(code, message);
    this.name = 'TimeblockServiceError';
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}
