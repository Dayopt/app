import { beforeEach, describe, expect, it } from 'vitest';

import { useShellStore } from './useShellStore';

describe('useShellStore - Sidebar suppression', () => {
  beforeEach(() => {
    useShellStore.setState({
      sidebar: { open: true, width: 256 },
      sidebarSuppressed: false,
    });
  });

  it('temporarily suppresses and restores the Sidebar without changing its preference', () => {
    useShellStore.getState().suppressSidebar();

    expect(useShellStore.getState().sidebarSuppressed).toBe(true);
    expect(useShellStore.getState().sidebar.open).toBe(true);

    useShellStore.getState().restoreSidebar();

    expect(useShellStore.getState().sidebarSuppressed).toBe(false);
    expect(useShellStore.getState().sidebar.open).toBe(true);
  });

  it('excludes the transient suppression state from persistence', () => {
    useShellStore.getState().suppressSidebar();

    const partialize = useShellStore.persist.getOptions().partialize;
    const persistedState = partialize?.(useShellStore.getState());

    expect(persistedState).toEqual({
      sidebar: { open: true, width: 256 },
    });
  });
});

describe('useShellStore - Timeblock search', () => {
  beforeEach(() => {
    useShellStore.setState({ activeSheet: null });
  });

  it('opens and closes the search overlay', () => {
    useShellStore.getState().openTimeblockSearch();
    expect(useShellStore.getState().activeSheet).toEqual({ type: 'timeblockSearch' });

    useShellStore.getState().closeTimeblockSearch();
    expect(useShellStore.getState().activeSheet).toBeNull();
  });

  it('does not persist the search overlay', () => {
    useShellStore.getState().openTimeblockSearch();

    const partialize = useShellStore.persist.getOptions().partialize;
    expect(partialize?.(useShellStore.getState())).toEqual({
      sidebar: useShellStore.getState().sidebar,
    });
  });
});
