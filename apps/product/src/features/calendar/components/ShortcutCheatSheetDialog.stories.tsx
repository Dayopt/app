import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import type { ShortcutCatalog } from '@/lib/keyboard/shortcut-catalog';
import { ShortcutCheatSheetDialog } from './ShortcutCheatSheetDialog';

const CATALOG: ShortcutCatalog = {
  groups: [
    { id: 'general', labelKey: 'calendar.shortcuts.groups.general', scope: 'global', order: 0 },
    {
      id: 'navigation',
      labelKey: 'calendar.shortcuts.groups.navigation',
      scope: 'calendar',
      order: 10,
    },
    { id: 'views', labelKey: 'calendar.shortcuts.groups.views', scope: 'calendar', order: 20 },
    { id: 'blocks', labelKey: 'calendar.shortcuts.groups.blocks', scope: 'calendar', order: 30 },
  ],
  entries: [
    {
      groupId: 'general',
      labelKey: 'calendar.shortcuts.actions.open',
      order: 0,
      keys: ['Shift+?'],
    },
    {
      groupId: 'navigation',
      labelKey: 'calendar.shortcuts.actions.previousPeriod',
      order: 10,
      keys: ['Cmd+ArrowLeft'],
    },
    {
      groupId: 'views',
      labelKey: 'calendar.shortcuts.actions.dayView',
      order: 100,
      keys: ['Cmd+1', '1'],
    },
    {
      groupId: 'blocks',
      labelKey: 'calendar.shortcuts.actions.copyBlock',
      order: 220,
      keys: ['Cmd+C'],
    },
    {
      groupId: 'blocks',
      labelKey: 'calendar.shortcuts.actions.deleteBlock',
      order: 240,
      keys: ['Delete', 'Backspace'],
    },
  ],
};

const meta = {
  title: 'Product/Features/Calendar/ShortcutCheatSheetDialog',
  component: ShortcutCheatSheetDialog,
  parameters: { layout: 'padded' },
  args: {
    open: true,
    onOpenChange: fn(),
    catalog: CATALOG,
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
