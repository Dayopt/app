import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { colors } from './colors';

const meta = {
  title: 'Design/Colors',
  parameters: {
    layout: 'padded',
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Tokens: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 16 }}>
      {Object.entries(colors).map(([name, token]) => (
        <div
          key={name}
          style={{
            alignItems: 'center',
            border: '1px solid var(--dayopt-color-border)',
            borderRadius: 'var(--dayopt-radius-md)',
            display: 'grid',
            gap: 16,
            gridTemplateColumns: 'minmax(120px, 1fr) minmax(180px, 2fr) minmax(220px, 3fr)',
            padding: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              aria-hidden="true"
              style={{
                background: `var(${token.cssVariable})`,
                border: '1px solid var(--dayopt-color-border-subtle)',
                borderRadius: 'var(--dayopt-radius-sm)',
                boxShadow: 'var(--dayopt-shadow-xs)',
                height: 40,
                width: 56,
              }}
            />
            <strong style={{ color: 'var(--dayopt-color-foreground)' }}>{name}</strong>
          </div>
          <code style={{ color: 'var(--dayopt-color-muted-foreground)' }}>{token.cssVariable}</code>
          <div style={{ color: 'var(--dayopt-color-muted-foreground)', display: 'grid', gap: 4 }}>
            <span>{token.value}</span>
            {token.darkValue ? <span>dark: {token.darkValue}</span> : null}
          </div>
        </div>
      ))}
    </div>
  ),
};
