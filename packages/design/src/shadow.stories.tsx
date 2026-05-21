import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { shadow } from './shadow';

const meta = {
  title: 'Design/Shadows',
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
        gap: 20,
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
      }}
    >
      {Object.entries(shadow).map(([name, token]) => (
        <div
          key={name}
          style={{
            background: 'var(--dayopt-color-card)',
            borderRadius: 'var(--dayopt-radius-md)',
            boxShadow: `var(${token.cssVariable})`,
            display: 'grid',
            gap: 12,
            minHeight: 156,
            padding: 20,
          }}
        >
          <strong>{name}</strong>
          <code style={{ color: 'var(--dayopt-color-muted-foreground)' }}>{token.cssVariable}</code>
          <span style={{ color: 'var(--dayopt-color-muted-foreground)' }}>{token.value}</span>
          {'darkValue' in token && token.darkValue ? (
            <span style={{ color: 'var(--dayopt-color-muted-foreground)' }}>
              dark: {token.darkValue}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  ),
};
