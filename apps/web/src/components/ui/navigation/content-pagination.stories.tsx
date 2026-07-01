/**
 * ContentPagination（blog / docs のページ送り）の Storybook Story。
 *
 * @dayopt/components の Pagination を組む presentational component。currentPage /
 * totalPages でリンクと省略記号、前後ボタンの有効/無効が決まる。
 */
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { ContentPagination } from './content-pagination';

const meta = {
  title: 'Web/Components/Navigation/ContentPagination',
  component: ContentPagination,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: { basePath: '/blog' },
} satisfies Meta<typeof ContentPagination>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 先頭ページ（「前へ」無効）。 */
export const FirstPage: Story = {
  args: { currentPage: 1, totalPages: 10 },
};

/** 中間ページ（両端に省略記号）。 */
export const MiddlePage: Story = {
  args: { currentPage: 5, totalPages: 10 },
};

/** 最終ページ（「次へ」無効）。 */
export const LastPage: Story = {
  args: { currentPage: 10, totalPages: 10 },
};

/** 省略記号なし（少ページ）。 */
export const FewPages: Story = {
  args: { currentPage: 2, totalPages: 3 },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  args: { currentPage: 1, totalPages: 10 },
  render: () => (
    <div className="flex flex-col gap-6">
      <ContentPagination currentPage={1} totalPages={10} basePath="/blog" />
      <ContentPagination currentPage={5} totalPages={10} basePath="/blog" />
      <ContentPagination currentPage={10} totalPages={10} basePath="/blog" />
      <ContentPagination currentPage={2} totalPages={3} basePath="/blog" />
    </div>
  ),
};
