import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';

import { Button, InlineBanner } from '@dayopt/components';

const meta = {
  title: 'Shared/Components/Feedback/InlineBanner',
  component: InlineBanner,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
  args: {
    visible: true,
    message: '他で変更がありました',
  },
} satisfies Meta<typeof InlineBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

/** メッセージのみの基本表示。 */
export const Default: Story = {};

/** アクションリンク付きの表示。 */
export const WithAction: Story = {
  args: {
    message: '新しいバージョンがあります',
    action: { label: '更新', onClick: () => {} },
  },
};

/** 非表示状態（高さ0にcollapse）。 */
export const Hidden: Story = {
  args: {
    visible: false,
  },
};

/** トグルでexpand/collapseアニメーションを確認。 */
export const Animation: Story = {
  render: function AnimationStory() {
    const [visible, setVisible] = useState(false);

    return (
      <div className="flex flex-col gap-4">
        <InlineBanner
          visible={visible}
          message="同期できません"
          action={{ label: 'リトライ', onClick: () => setVisible(false) }}
        />
        <div className="px-4">
          <Button variant="outline" onClick={() => setVisible((v) => !v)}>
            {visible ? 'Hide' : 'Show'}
          </Button>
        </div>
      </div>
    );
  },
};

/** 4ケースすべてを表示。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <InlineBanner
        visible
        message="他で変更がありました"
        action={{ label: '再読み込み', onClick: () => {} }}
      />
      <InlineBanner
        visible
        message="同期できません"
        action={{ label: 'リトライ', onClick: () => {} }}
      />
      <InlineBanner visible message="オフラインです" />
      <InlineBanner
        visible
        message="新しいバージョンがあります"
        action={{ label: '更新', onClick: () => {} }}
      />
    </div>
  ),
};
