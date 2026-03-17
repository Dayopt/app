import { fn } from 'storybook/test';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { AnimalCard } from './AnimalCard';

/** AnimalCard - クロノタイプ動物選択カード */
const meta = {
  title: 'Features/Onboarding/AnimalCard',
  component: AnimalCard,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    onSelect: fn(),
  },
} satisfies Meta<typeof AnimalCard>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** デフォルト（未選択） */
export const Default: Story = {
  args: {
    type: 'lion',
    emoji: '🦁',
    name: 'Lion',
    trait: 'Early riser',
    time: 'Peak: 7 AM – 12 PM',
    hint: 'You naturally wake up before 6 AM',
    isSelected: false,
  },
};

/** 選択状態 */
export const Selected: Story = {
  args: {
    type: 'bear',
    emoji: '🐻',
    name: 'Bear',
    trait: 'Steady pace',
    time: 'Peak: 10 AM – 2 PM',
    hint: 'You follow a regular sleep schedule',
    isSelected: true,
  },
};

/** 全パターン一覧 */
export const AllPatterns: Story = {
  args: {
    type: 'lion',
    emoji: '🦁',
    name: 'Lion',
    trait: 'Early riser',
    time: 'Peak: 7 AM – 12 PM',
    hint: 'You naturally wake up before 6 AM',
    isSelected: false,
  },
  render: (args) => {
    const cards = [
      {
        type: 'lion' as const,
        emoji: '🦁',
        name: 'Lion',
        trait: 'Early riser',
        time: 'Peak: 7 AM – 12 PM',
        hint: 'You naturally wake up before 6 AM',
      },
      {
        type: 'bear' as const,
        emoji: '🐻',
        name: 'Bear',
        trait: 'Steady pace',
        time: 'Peak: 10 AM – 2 PM',
        hint: 'You follow a regular sleep schedule',
      },
      {
        type: 'wolf' as const,
        emoji: '🐺',
        name: 'Wolf',
        trait: 'Night owl',
        time: 'Peak: 3 PM – 9 PM',
        hint: 'You come alive in the evening',
      },
      {
        type: 'dolphin' as const,
        emoji: '🐬',
        name: 'Dolphin',
        trait: 'Light sleeper',
        time: 'Peak: 8 AM – 12 PM',
        hint: 'You sleep lightly and wake often',
      },
    ];
    return (
      <div className="grid grid-cols-2 gap-3" style={{ width: 320 }}>
        {cards.map((card) => (
          <AnimalCard
            key={card.type}
            {...card}
            isSelected={card.type === 'bear'}
            onSelect={args.onSelect}
          />
        ))}
      </div>
    );
  },
};
