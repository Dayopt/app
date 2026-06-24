/**
 * NavBadge Stories
 *
 * Nav アイコン右上に表示する "NEW" / "β" バッジ。Phase 2-D Step D-5 で新規追加。
 * Nav icon と組み合わせて使う小さな状態バッジ。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Sparkles } from 'lucide-react';

import { cn } from '@/lib/utils';

// NavBadge は useTranslations 依存のため、stories では同形状の静的 mock を使う。
function MockNavBadge({
  variant = 'new',
  className,
}: {
  variant?: 'new' | 'beta';
  className?: string;
}) {
  const label = variant === 'beta' ? 'β' : 'NEW';
  return (
    <span
      aria-label={label}
      className={cn(
        'absolute -top-1 -right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1',
        'bg-warning text-warning-foreground text-xs leading-none font-medium',
        className,
      )}
    >
      {label}
    </span>
  );
}

/** NavBadge — icon 右上に配置する "NEW" / "β" バッジ。AI タブの stub 状態を暗示する用途。 */
const meta = {
  title: 'Product/Components/Shell/Sidebar/NavBadge',
  component: MockNavBadge,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
} satisfies Meta<typeof MockNavBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

/** β バリアント（Watching AI stub の暗示）。 */
export const Beta: Story = {
  args: { variant: 'beta' },
  decorators: [
    (Story) => (
      <div className="relative inline-flex size-8 items-center justify-center">
        <Sparkles className="text-muted-foreground size-4" />
        <Story />
      </div>
    ),
  ],
};

/** NEW バリアント（新機能告知用）。 */
export const New: Story = {
  args: { variant: 'new' },
  decorators: [
    (Story) => (
      <div className="relative inline-flex size-8 items-center justify-center">
        <Sparkles className="text-muted-foreground size-4" />
        <Story />
      </div>
    ),
  ],
};

/** 両バリアント並列。 */
export const AllVariants: Story = {
  render: () => (
    <div className="flex items-center gap-8">
      <div>
        <p className="text-muted-foreground mb-2 text-xs">Beta</p>
        <div className="relative inline-flex size-8 items-center justify-center">
          <Sparkles className="text-muted-foreground size-4" />
          <MockNavBadge variant="beta" />
        </div>
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-xs">New</p>
        <div className="relative inline-flex size-8 items-center justify-center">
          <Sparkles className="text-muted-foreground size-4" />
          <MockNavBadge variant="new" />
        </div>
      </div>
    </div>
  ),
};
