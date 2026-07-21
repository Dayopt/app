'use client';

import { RootErrorState } from '@web/components/errors/RootErrorState';
import { isDevelopment } from '@web/platform/config/env';
import { captureBoundaryError } from '@web/platform/observability/capture-boundary-error';
import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureBoundaryError(error, 'root_error');
  }, [error]);

  return <RootErrorState error={error} onRetry={reset} showDetails={isDevelopment} />;
}
