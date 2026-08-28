import { useEffect, useState } from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'ja',
}));

// HelpMenuItems の onSelect が実際に呼ぶ openSheet を、Dialog の open 状態へ
// 反映する薄い reactive mock。setter は Harness が render 時に登録する
// （vi.mock はモジュールトップレベルで hoist されるため、テストごとの closure を
// 直接キャプチャできない。このモジュール変数経由で橋渡しする）。
let setOpenSheet: (type: 'shortcutCheatSheet' | null) => void = () => {};
let setOpenContact: (open: boolean) => void = () => {};

vi.mock('@/lib/stores/useShellStore', () => ({
  useShellStore: (selector: (state: { openSheet: (sheet: { type: string }) => void }) => unknown) =>
    selector({
      openSheet: (sheet) => {
        if (sheet.type === 'shortcutCheatSheet') setOpenSheet('shortcutCheatSheet');
        if (sheet.type === 'contact') setOpenContact(true);
      },
    }),
}));

import { Dialog, DialogContent, DialogTitle } from '@dayopt/components';

import { SidebarHelpMenu } from './Sidebar';

/**
 * #2248: #2153 の setTimeout(0) 遅延では実機の race（DropdownMenu が閉じる際に
 * trigger へフォーカスを戻す処理と、新しく mount された modal=false Dialog の
 * outside-interaction 検出が競合し、開いた直後に閉じる）が解消しなかった。
 * root cause は DropdownMenuContent の onCloseAutoFocus 未指定。
 *
 * この test は #2153 の UserMenu.test.tsx と異なり、DropdownMenu を実際に
 * uncontrolled で開閉させ、選択操作の結果 Dialog が「開いたまま維持される」
 * ことまで固定する（前回の test は openSheet が呼ばれたことしか見ておらず、
 * この race 自体を再現できなかった）。fake timer ではなく実タイマー
 * （userEvent 既定）を使い、ポインタ操作の順序をそのまま再現する。
 */
function Harness() {
  const [shortcutOpen, setShortcutOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);

  // モジュール変数へのブリッジ登録は render の純度を保つため effect 内で行う。
  useEffect(() => {
    setOpenSheet = (type) => setShortcutOpen(type === 'shortcutCheatSheet');
    setOpenContact = setContactOpen;
    // setState setter は安定参照なので mount 時 1 回の登録で足りる。
  }, []);

  return (
    <>
      <SidebarHelpMenu />
      <Dialog open={shortcutOpen} onOpenChange={setShortcutOpen} responsive="dialog" modal={false}>
        <DialogContent size="lg">
          <DialogTitle>shortcuts</DialogTitle>
        </DialogContent>
      </Dialog>
      <Dialog open={contactOpen} onOpenChange={setContactOpen} responsive="dialog" modal={false}>
        <DialogContent size="lg">
          <DialogTitle>contact</DialogTitle>
        </DialogContent>
      </Dialog>
    </>
  );
}

describe('SidebarHelpMenu (#2248 shortcut/contact dialog race)', () => {
  beforeEach(() => {
    setOpenSheet = () => {};
    setOpenContact = () => {};
  });

  it('メニューからキーボードショートカットを選択すると、ダイアログが開いたまま維持される', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'navigation.sidebar.getHelp' }));
    await user.click(screen.getByText('navigation.navUser.helpSubmenu.keyboardShortcuts'));

    // 実タイマーで複数 tick 進めても、開いた直後に閉じる race が起きていないことを確認する。
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(screen.getByText('shortcuts')).toBeInTheDocument();
  });

  it('メニューからお問い合わせを選択すると、ダイアログが開いたまま維持される（同型 onSelect）', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'navigation.sidebar.getHelp' }));
    await user.click(screen.getByText('navigation.navUser.helpSubmenu.contact'));

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(screen.getByText('contact')).toBeInTheDocument();
  });
});
