import type { Meta, StoryObj } from '@storybook/nextjs-vite';

/**
 * MobileTouchHint — モバイルタッチ操作のヒント表示
 *
 * 初回モバイルアクセス時にロングプレス操作のヒントをトースト風に表示。
 * - 15秒後に自動非表示（次回も再表示される）
 * - Xボタンで永続非表示
 * - 実際のコンポーネントはlocalStorage + useMediaQueryに依存するため、
 *   ここではビジュアルプレビューのみ提供。
 */
const meta = {
  title: 'Features/Calendar/MobileTouchHint',
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'mobile1' },
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** ヒント表示の静的プレビュー。 */
export const Preview: Story = {
  render: () => (
    <div className="bg-background relative h-screen w-full">
      <div className="p-4">
        <p className="text-muted-foreground text-sm">
          MobileTouchHint は localStorage + useMediaQuery に依存するため、
          実機またはモバイルビューポートで確認してください。
        </p>
      </div>

      {/* 静的プレビュー */}
      <div className="bg-primary text-primary-foreground fixed right-4 bottom-20 left-4 z-50 rounded-2xl px-4 py-4 shadow-lg">
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <p className="text-sm font-normal">Tip: Long press to create</p>
            <p className="mt-1 text-xs opacity-90">
              Press and hold on the calendar to create a new schedule
            </p>
          </div>
          <button
            type="button"
            className="rounded-full p-1 transition-colors hover:bg-white/20"
            aria-label="Close"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  ),
};
