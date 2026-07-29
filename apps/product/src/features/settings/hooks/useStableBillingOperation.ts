'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type BillingOperationSettlement = 'retryable' | 'terminal';

interface StableBillingOperation {
  begin: () => string | null;
  isLocked: boolean;
  reset: () => void;
  settle: (operationId: string, settlement: BillingOperationSettlement) => boolean;
}

/**
 * Keeps one client-generated operation ID across an uncertain HTTP retry.
 * A synchronous ref lock closes the double-click gap before React re-renders.
 */
export function useStableBillingOperation(): StableBillingOperation {
  const operationIdRef = useRef<string | null>(null);
  const lockedRef = useRef(false);
  const mountedRef = useRef(true);
  const [isLocked, setIsLocked] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      lockedRef.current = false;
      operationIdRef.current = null;
    };
  }, []);

  const begin = useCallback(() => {
    if (!mountedRef.current || lockedRef.current) return null;

    const operationId = operationIdRef.current ?? crypto.randomUUID();
    operationIdRef.current = operationId;
    lockedRef.current = true;
    setIsLocked(true);
    return operationId;
  }, []);

  const settle = useCallback(
    (operationId: string, settlement: BillingOperationSettlement): boolean => {
      if (!mountedRef.current || operationIdRef.current !== operationId) return false;

      lockedRef.current = false;
      if (settlement === 'terminal') operationIdRef.current = null;
      setIsLocked(false);
      return true;
    },
    [],
  );

  const reset = useCallback(() => {
    lockedRef.current = false;
    operationIdRef.current = null;
    if (mountedRef.current) setIsLocked(false);
  }, []);

  return { begin, isLocked, reset, settle };
}
