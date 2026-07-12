import { ServiceError } from '@/lib/trpc/errors';

export class TimeblockServiceError extends ServiceError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = 'TimeblockServiceError';
  }
}
