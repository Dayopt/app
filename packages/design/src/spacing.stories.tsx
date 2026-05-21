import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { spacing } from './spacing';

const meta = {
  title: 'Design/Spacing',
  parameters: {
    layout: 'padded',
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Tokens: Story = {
  render: () => (
    <div style={{ color: 'var(--dayopt-color-foreground)', display: 'grid', gap: 16 }}>
      {Object.entries(spacing).map(([name, token]) => (
        <div
          key={name}
          style={{
            alignItems: 'center',
            display: 'grid',
            gap: 16,
            gridTemplateColumns: '64px 180px 1fr 72px',
          }}
        >
          <strong>{name}</strong>
          <code style={{ color: 'var(--dayopt-color-muted-foreground)' }}>{token.cssVariable}</code>
          <div
            aria-hidden="true"
            style={{
              background: 'var(--dayopt-color-primary)',
              borderRadius: 'var(--dayopt-radius-sm)',
              height: 24,
              width: `var(${token.cssVariable})`,
            }}
          />
          <span style={{ color: 'var(--dayopt-color-muted-foreground)' }}>{token.px}px</span>
        </div>
      ))}
    </div>
  ),
};
