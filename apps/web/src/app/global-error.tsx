'use client';

import { isDevelopment } from '@/platform/config/env';
import { captureBoundaryError } from '@/platform/observability/capture-boundary-error';
import { Button, Container, Heading, Text } from '@dayopt/components';
import { useEffect } from 'react';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    captureBoundaryError(error, 'global_error');
  }, [error]);

  return (
    <html>
      <body>
        <div className="bg-background flex min-h-screen items-center justify-center">
          <Container>
            <div className="mx-auto max-w-md text-center">
              <div className="text-muted-foreground/20 mb-4 text-9xl font-medium">!</div>

              <Heading as="h2" size="xl" className="mb-4">
                Something went wrong
              </Heading>

              <Text variant="muted" className="mb-8">
                An unexpected error occurred. Please try again. If it continues, contact support.
              </Text>

              <div className="space-y-4">
                <Button onClick={reset} className="w-full">
                  Try again
                </Button>

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => (window.location.href = '/')}
                >
                  Go home
                </Button>
              </div>

              {/* Error details for development */}
              {isDevelopment && (
                <div className="bg-container mt-8 rounded-lg p-4 text-left">
                  <Text size="sm" variant="muted" className="mb-2 block">
                    Development Error Details:
                  </Text>
                  <pre className="text-destructive overflow-auto text-xs">{error.message}</pre>
                  {error.digest && (
                    <Text size="xs" variant="muted" className="mt-2 block">
                      Error ID: {error.digest}
                    </Text>
                  )}
                </div>
              )}
            </div>
          </Container>
        </div>
      </body>
    </html>
  );
}
