export interface GlobalErrorActions {
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
      window.location.href = '/';
    },
  };
}
