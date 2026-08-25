import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { TemplateContextMenu } from './TemplateContextMenu';

/** テンプレート行の統治（改名・削除）を右クリックに畳んだメニュー（v1.0 §5.4）。 */
const meta = {
  title: 'Product/Features/Calendar/Templates/TemplateContextMenu',
  component: TemplateContextMenu,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: {
    position: { x: 0, y: 0 },
    onClose: fn(),
    onRename: fn(),
    onDelete: fn(),
  },
} satisfies Meta<typeof TemplateContextMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 右クリックでメニューを開くラッパー。 */
function ContextMenuTrigger() {
  const [menuState, setMenuState] = useState<{ x: number; y: number } | null>(null);

  return (
    <div
      className="border-border bg-muted relative flex h-40 w-64 cursor-context-menu items-center justify-center rounded-lg border"
      onContextMenu={(e) => {
        e.preventDefault();
        setMenuState({ x: e.clientX, y: e.clientY });
      }}
    >
      <span className="text-muted-foreground text-sm">右クリックでメニューを開く</span>
      {menuState && (
        <TemplateContextMenu
          position={menuState}
          onClose={() => setMenuState(null)}
          onRename={fn()}
          onDelete={fn()}
        />
      )}
    </div>
  );
}

export const Default: Story = {
  render: () => <ContextMenuTrigger />,
};

export const DirectDisplay: Story = {
  render: () => (
    <div className="relative" style={{ height: 120 }}>
      <TemplateContextMenu
        position={{ x: 0, y: 0 }}
        onClose={fn()}
        onRename={fn()}
        onDelete={fn()}
      />
    </div>
  ),
};

export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-xs">右クリックで開く</span>
        <ContextMenuTrigger />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-xs">直接表示（位置固定）</span>
        <div className="relative" style={{ height: 120 }}>
          <TemplateContextMenu
            position={{ x: 0, y: 0 }}
            onClose={fn()}
            onRename={fn()}
            onDelete={fn()}
          />
        </div>
      </div>
    </div>
  ),
};
