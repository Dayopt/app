import { ServiceError } from '@/lib/trpc/errors';

export class TimeModelServiceError extends ServiceError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = 'TimeModelServiceError';
  }
}
