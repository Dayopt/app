import { notFound } from 'next/navigation';

/** Prevents development playgrounds from being rendered in production. */
export function assertPlaygroundAccess(): void {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }
}
