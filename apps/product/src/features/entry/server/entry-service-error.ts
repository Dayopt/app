import { ServiceError } from '@/lib/trpc/errors';

export class EntryServiceError extends ServiceError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = 'EntryServiceError';
  }
}
