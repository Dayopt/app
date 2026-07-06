import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { AnimatedWidthPanel } from './AnimatedWidthPanel';

const meta = {
  title: 'Product/Components/Shell/AnimatedWidthPanel',
  component: AnimatedWidthPanel,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  args: {
    open: true,
    width: 256,
    children: null,
  },
  argTypes: {
    children: { control: false },
  },
} satisfies Meta<typeof AnimatedWidthPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

function PanelSurface() {
  return (
    <div className="border-border bg-surface-container flex h-full w-full flex-col gap-4 border-r p-4">
      <div className="bg-card h-8 rounded-lg" />
      <div className="bg-container h-24 rounded-lg" />
      <div className="bg-container h-8 rounded-lg" />
      <div className="bg-container h-8 rounded-lg" />
    </div>
  );
}

function Stage({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-border bg-background flex h-64 w-96 overflow-hidden rounded-2xl border">
      {children}
    </div>
  );
}

/** 左側で開いた状態。 */
export const LeftOpen: Story = {
  render: () => (
    <Stage>
      <AnimatedWidthPanel open width={256}>
        <PanelSurface />
      </AnimatedWidthPanel>
      <div className="bg-background flex-1" />
    </Stage>
  ),
};

/** 右側で開いた状態。 */
export const RightOpen: Story = {
  render: () => (
    <Stage>
      <div className="bg-background flex-1" />
      <AnimatedWidthPanel open width={256} side="right">
        <PanelSurface />
      </AnimatedWidthPanel>
    </Stage>
  ),
};

/** 閉じた状態。 */
export const Closed: Story = {
  render: () => (
    <Stage>
      <AnimatedWidthPanel open={false} width={256}>
        <PanelSurface />
      </AnimatedWidthPanel>
      <div className="bg-background flex-1" />
    </Stage>
  ),
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Stage>
        <AnimatedWidthPanel open width={256}>
          <PanelSurface />
        </AnimatedWidthPanel>
        <div className="bg-background flex-1" />
      </Stage>
      <Stage>
        <div className="bg-background flex-1" />
        <AnimatedWidthPanel open width={256} side="right">
          <PanelSurface />
        </AnimatedWidthPanel>
      </Stage>
      <Stage>
        <AnimatedWidthPanel open={false} width={256}>
          <PanelSurface />
        </AnimatedWidthPanel>
        <div className="bg-background flex-1" />
      </Stage>
    </div>
  ),
};
