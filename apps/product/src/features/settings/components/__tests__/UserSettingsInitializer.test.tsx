import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { UserSettingsInitializer } from '../UserSettingsInitializer';

/**
 * I-03 characterization test（gate semantics + data integrity 境界）
 *
 * 目的: Phase 4（server-state store の TanStack Query 移行）の前に、
 * UserSettingsInitializer の「現在の公開挙動」を固定する。store の内部実装
 * （Zustand）に依存せず、`useUserSettings` の返り値 → render 結果の契約だけを
 * 検証するため、移行後も同じ assertion が成立する（= 回帰検知になる）。
 *
 * 固定する不変条件:
 * 1. hydrated まで children を render しない（loading=null / error=alert / paused=status）
 * 2. data integrity: hydration 前は children が mount されないため、children 内の
 *    timezone 依存 mutation（entry 作成等）が defaults のまま発火しない
 */

type UserSettingsState = {
  hydrated: boolean;
  isPaused: boolean;
  error: unknown;
};

// useUserSettings の返り値をテストごとに差し替える
let mockState: UserSettingsState = { hydrated: false, isPaused: false, error: null };

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('../../hooks/useUserSettings', () => ({
  useUserSettings: () => mockState,
}));

// children が mount された時に呼ばれる spy（timezone 依存 mutation の代理）
const childMountSpy = vi.fn();

function Child() {
  childMountSpy();
  return <div data-testid="app-content">app content</div>;
}

function renderGate() {
  return render(
    <UserSettingsInitializer>
      <Child />
    </UserSettingsInitializer>,
  );
}

describe('UserSettingsInitializer（gate semantics）', () => {
  beforeEach(() => {
    mockState = { hydrated: false, isPaused: false, error: null };
    childMountSpy.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('hydrated=true: children を render する', () => {
    mockState = { hydrated: true, isPaused: false, error: null };
    renderGate();

    expect(screen.getByTestId('app-content')).toBeInTheDocument();
    expect(childMountSpy).toHaveBeenCalledTimes(1);
  });

  it('loading（hydrated=false, error=null, paused=false）: null を返し children を mount しない', () => {
    mockState = { hydrated: false, isPaused: false, error: null };
    const { container } = renderGate();

    expect(screen.queryByTestId('app-content')).not.toBeInTheDocument();
    expect(childMountSpy).not.toHaveBeenCalled();
    // loading は完全な blank（role を持たない）
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it('error: role="alert" の再試行 UI を出し children を mount しない', () => {
    mockState = { hydrated: false, isPaused: false, error: new Error('load failed') };
    renderGate();

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeInTheDocument();
    expect(screen.queryByTestId('app-content')).not.toBeInTheDocument();
    expect(childMountSpy).not.toHaveBeenCalled();
  });

  it('paused（offline, cache なし）: role="status" のオフライン UI を出し children を mount しない', () => {
    mockState = { hydrated: false, isPaused: true, error: null };
    renderGate();

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByTestId('app-content')).not.toBeInTheDocument();
    expect(childMountSpy).not.toHaveBeenCalled();
  });

  it('error は paused より優先される（両方真でも alert を出す）', () => {
    mockState = { hydrated: false, isPaused: true, error: new Error('load failed') };
    renderGate();

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('hydrated は error/paused より優先される（hydrated 真なら children を出す）', () => {
    mockState = { hydrated: true, isPaused: true, error: new Error('load failed') };
    renderGate();

    expect(screen.getByTestId('app-content')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('UserSettingsInitializer（data integrity 境界）', () => {
  beforeEach(() => {
    mockState = { hydrated: false, isPaused: false, error: null };
    childMountSpy.mockClear();
  });

  it('hydration 完了まで children（timezone 依存 mutation を含む）が mount されない', () => {
    // 初期: 未 hydrate → child は mount されない
    mockState = { hydrated: false, isPaused: false, error: null };
    const { rerender } = renderGate();
    expect(childMountSpy).not.toHaveBeenCalled();

    // hydration 完了 → 初めて child が mount される
    mockState = { hydrated: true, isPaused: false, error: null };
    rerender(
      <UserSettingsInitializer>
        <Child />
      </UserSettingsInitializer>,
    );
    expect(childMountSpy).toHaveBeenCalledTimes(1);
  });
});
