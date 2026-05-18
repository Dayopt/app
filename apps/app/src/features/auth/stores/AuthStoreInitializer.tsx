'use client';

import { useEffect, useRef } from 'react';
import { useAuthStore } from './useAuthStore';

/**
 * AuthStore初期化コンポーネント
 * Providersツリーの最上位で一度だけ実行される
 */
export function AuthStoreInitializer() {
  const initialized = useRef(false);
  const initialize = useAuthStore((state) => state.initialize);

  useEffect(() => {
    if (initialized.current) return;

    initialized.current = true;
    initialize();
  }, [initialize]);

  return null;
}
