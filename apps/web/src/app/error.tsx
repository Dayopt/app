'use client';

import { ErrorLayout } from '@/components/errors/ErrorLayout';
import { Button } from '@/components/ui/button';
import { isDevelopment } from '@/platform/config/env';
import Link from 'next/link';
import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Application error:', error);
  }, [error]);

  return (
    <ErrorLayout
      title="Something went wrong"
      description="We encountered an unexpected error. Please try again or contact support if the problem persists."
      showBackButton={false}
    >
      <div className="mt-12 space-y-4">
        <Button onClick={reset} className="w-full sm:w-auto">
          Try again
        </Button>

        <Button variant="outline" asChild className="w-full sm:ml-4 sm:w-auto">
          <Link href="/">Go home</Link>
        </Button>
      </div>

      {/* Error details for development */}
      {isDevelopment && (
        <details className="mt-8">
          <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-sm">
            Error details (dev only)
          </summary>
          <pre className="bg-muted text-destructive mt-2 overflow-auto rounded p-4 text-xs">
            {error.message}
            {error.stack && (
              <>
                {'\n\n'}
                {error.stack}
              </>
            )}
          </pre>
        </details>
      )}
    </ErrorLayout>
  );
}
