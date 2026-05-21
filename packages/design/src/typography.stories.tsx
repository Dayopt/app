import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { typography } from './typography';

const meta = {
  title: 'Design/Typography',
  parameters: {
    layout: 'padded',
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Tokens: Story = {
  render: () => (
    <div style={{ color: 'var(--dayopt-color-foreground)', display: 'grid', gap: 32 }}>
      <section style={{ display: 'grid', gap: 12 }}>
        {Object.entries(typography.fontFamily).map(([name, token]) => (
          <div key={name} style={{ display: 'grid', gap: 4 }}>
            <code style={{ color: 'var(--dayopt-color-muted-foreground)' }}>
              {token.cssVariable}
            </code>
            <div
              style={{
                fontFamily: `var(${token.cssVariable})`,
                fontSize: 'var(--dayopt-font-size-2xl)',
              }}
            >
              {name}: Dayopt design tokens
            </div>
          </div>
        ))}
      </section>
      <section style={{ display: 'grid', gap: 16 }}>
        {Object.entries(typography.fontSize).map(([name, token]) => (
          <div
            key={name}
            style={{
              alignItems: 'baseline',
              borderBottom: '1px solid var(--dayopt-color-border-subtle)',
              display: 'grid',
              gap: 16,
              gridTemplateColumns: '96px 180px 1fr',
              paddingBottom: 12,
            }}
          >
            <strong>{name}</strong>
            <code style={{ color: 'var(--dayopt-color-muted-foreground)' }}>
              {token.cssVariable}
            </code>
            <span
              style={{
                fontSize: `var(${token.cssVariable})`,
                lineHeight: 'var(--dayopt-line-height-normal)',
              }}
            >
              {token.value} / {token.px}px
            </span>
          </div>
        ))}
      </section>
      <section style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
        {Object.entries(typography.fontWeight).map(([name, token]) => (
          <div key={name} style={{ display: 'grid', gap: 4 }}>
            <code style={{ color: 'var(--dayopt-color-muted-foreground)' }}>
              {token.cssVariable}
            </code>
            <span
              style={{
                fontSize: 'var(--dayopt-font-size-xl)',
                fontWeight: `var(${token.cssVariable})`,
              }}
            >
              {name} {token.value}
            </span>
          </div>
        ))}
        {Object.entries(typography.lineHeight).map(([name, token]) => (
          <div key={name} style={{ maxWidth: 220, display: 'grid', gap: 4 }}>
            <code style={{ color: 'var(--dayopt-color-muted-foreground)' }}>
              {token.cssVariable}
            </code>
            <span style={{ lineHeight: `var(${token.cssVariable})` }}>
              {name}: Line height sample across two lines.
            </span>
          </div>
        ))}
      </section>
    </div>
  ),
};
