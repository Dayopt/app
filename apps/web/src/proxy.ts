import { routing } from '@dayopt/i18n/routing';
import createMiddleware from 'next-intl/middleware';

export default createMiddleware(routing);

export const config = {
  // Match all pathnames except for
  // - API routes
  // - _next (Next.js internals)
  // - static files (images, etc.)
  matcher: ['/((?!api|_next|.*\\..*).*)'],
};
