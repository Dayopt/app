interface GlobalErrorActions {
  retry: () => void;
  reload: () => void;
  goHome: () => void;
}

/**
 * global-error の復旧アクションを 1 箇所に集約
 */
export function createGlobalErrorActions({ reset }: { reset: () => void }): GlobalErrorActions {
  return {
    retry: () => {
      reset();
    },
    reload: () => {
      window.location.reload();
    },
    goHome: () => {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- global error からの復旧は状態を完全にリセットするためハードリロードが意図的
      window.location.href = '/';
    },
  };
}
