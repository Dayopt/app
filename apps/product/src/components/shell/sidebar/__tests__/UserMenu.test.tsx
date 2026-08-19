import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const openSheetMock = vi.fn();

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'ja',
}));

vi.mock('@/lib/stores/useShellStore', () => ({
  useShellStore: (selector: (state: { openSheet: typeof openSheetMock }) => unknown) =>
    selector({ openSheet: openSheetMock }),
}));

import { DropdownMenu, DropdownMenuContent } from '@dayopt/components';

import { HelpMenuItems } from '../UserMenu';

/**
 * #2153: DropdownMenuItem の onSelect から直接 Dialog/Sheet を開くと、DropdownMenu の
 * close 処理と新しい Dialog の outside-interaction 検出が同一 tick で競合し、開いた
 * 瞬間に閉じる（ShortcutCheatSheetDialog は modal=false のため overlay が無くこの
 * 競合の影響を受ける）。setTimeout で macrotask まで遅らせることで回避する — この
 * test は「選択操作の結果、正しい sheet が最終的に開かれる」という契約を固定する
 * （tick 単位の同期/非同期タイミング自体は jsdom + fake timers の組み合わせが
 * 不安定なため assert 対象にしない）。
 */
describe('HelpMenuItems (#2153)', () => {
  beforeEach(() => {
    openSheetMock.mockClear();
  });

  it('キーボードショートカット選択時、shortcutCheatSheet シートを開く', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu open>
        <DropdownMenuContent>
          <HelpMenuItems />
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    await user.click(screen.getByText('navigation.navUser.helpSubmenu.keyboardShortcuts'));

    await waitFor(() => {
      expect(openSheetMock).toHaveBeenCalledWith({ type: 'shortcutCheatSheet' });
    });
  });

  it('お問い合わせ選択時、contact シートを開く', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu open>
        <DropdownMenuContent>
          <HelpMenuItems />
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    await user.click(screen.getByText('navigation.navUser.helpSubmenu.contact'));

    await waitFor(() => {
      expect(openSheetMock).toHaveBeenCalledWith({ type: 'contact' });
    });
  });
});
