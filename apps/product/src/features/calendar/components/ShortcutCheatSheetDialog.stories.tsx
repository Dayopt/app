import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import type { ShortcutHelpItem } from '../hooks/keyboard/shortcut-registry';
import { ShortcutCheatSheetDialog } from './ShortcutCheatSheetDialog';

const SHORTCUTS: ShortcutHelpItem[] = [
  {
    group: 'general',
    labelKey: 'calendar.shortcuts.actions.open',
    order: 0,
    keys: ['?'],
  },
  {
    group: 'navigation',
    labelKey: 'calendar.shortcuts.actions.previousPeriod',
    order: 10,
    keys: ['Cmd+ArrowLeft'],
  },
  {
    group: 'views',
    labelKey: 'calendar.shortcuts.actions.dayView',
    order: 100,
    keys: ['1', 'Cmd+1'],
  },
  {
    group: 'blocks',
    labelKey: 'calendar.shortcuts.actions.copyBlock',
    order: 220,
    keys: ['Cmd+C'],
  },
  {
    group: 'blocks',
    labelKey: 'calendar.shortcuts.actions.deleteBlock',
    order: 240,
    keys: ['Delete', 'Backspace'],
  },
];

const meta = {
  title: 'Product/Features/Calendar/ShortcutCheatSheetDialog',
  component: ShortcutCheatSheetDialog,
  parameters: { layout: 'padded' },
  args: {
    open: true,
    onOpenChange: fn(),
    shortcuts: SHORTCUTS,
    platform: 'mac',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ShortcutCheatSheetDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Mac向けキー表記。 */
export const Default: Story = {};

/** Windows / Linux向けキー表記。 */
export const OtherPlatform: Story = {
  args: { platform: 'other' },
};

/** 標準状態の一覧。 */
export const AllPatterns: Story = {};
