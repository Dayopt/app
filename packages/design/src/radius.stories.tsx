import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { radius } from './radius';

const meta = {
  title: 'Design/Radius',
  parameters: {
    layout: 'padded',
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Tokens: Story = {
  render: () => (
    <div
      style={{
        color: 'var(--dayopt-color-foreground)',
        display: 'grid',
        gap: 16,
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
      }}
    >
      {Object.entries(radius).map(([name, token]) => (
        <div key={name} style={{ display: 'grid', gap: 10 }}>
          <div
            aria-hidden="true"
            style={{
              background: 'var(--dayopt-color-card)',
              border: '1px solid var(--dayopt-color-border)',
              borderRadius: `var(${token.cssVariable})`,
              boxShadow: 'var(--dayopt-shadow-sm)',
              height: 96,
            }}
          />
          <strong>{name}</strong>
          <code style={{ color: 'var(--dayopt-color-muted-foreground)' }}>{token.cssVariable}</code>
          <span style={{ color: 'var(--dayopt-color-muted-foreground)' }}>{token.value}</span>
        </div>
      ))}
    </div>
  ),
};
