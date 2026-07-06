import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import type { Tag } from '@/features/tags';
import { StoryTRPCProvider } from '@dayopt/storybook/mocks/trpc';

import { TagChipRow } from './TagChipRow';

/** MOCK_TAGS: sidebar と同じ sort_order で chip 行に並ぶ想定 */
const MOCK_TAGS: Tag[] = [
  {
    id: 'tag-1',
    name: '仕事',
    user_id: 'user-1',
    color: 'blue',
    icon: 'briefcase',
    parent_id: null,
    is_active: true,
    sort_order: 0,
    created_at: null,
    updated_at: null,
  },
  {
    id: 'tag-2',
    name: '会議',
    user_id: 'user-1',
    color: 'blue',
    icon: 'users',
    parent_id: 'tag-1',
    is_active: true,
    sort_order: 1,
    created_at: null,
    updated_at: null,
  },
  {
    id: 'tag-3',
    name: '開発',
    user_id: 'user-1',
    color: 'indigo',
    icon: 'code',
    parent_id: 'tag-1',
    is_active: true,
    sort_order: 2,
    created_at: null,
    updated_at: null,
  },
  {
    id: 'tag-4',
    name: '勉強',
    user_id: 'user-1',
    color: 'green',
    icon: 'book-open',
    parent_id: null,
    is_active: true,
    sort_order: 3,
    created_at: null,
    updated_at: null,
  },
  {
    id: 'tag-5',
    name: '運動',
    user_id: 'user-1',
    color: 'amber',
    icon: 'dumbbell',
    parent_id: null,
    is_active: true,
    sort_order: 4,
    created_at: null,
    updated_at: null,
  },
  {
    id: 'tag-6',
    name: '休憩',
    user_id: 'user-1',
    color: 'orange',
    icon: 'coffee',
    parent_id: null,
    is_active: true,
    sort_order: 5,
    created_at: null,
    updated_at: null,
  },
  {
    id: 'tag-7',
    name: '読書',
    user_id: 'user-1',
    color: 'teal',
    icon: 'book',
    parent_id: null,
    is_active: true,
    sort_order: 6,
    created_at: null,
    updated_at: null,
  },
];

/** 30 件までスケールさせた版（横スクロールの確認用） */
const MANY_TAGS: Tag[] = Array.from({ length: 30 }, (_, i) => ({
  id: `tag-many-${i}`,
  name: `タグ${i + 1}`,
  user_id: 'user-1',
  color: ['blue', 'indigo', 'green', 'amber', 'orange', 'teal', 'pink', 'violet'][i % 8] ?? 'gray',
  icon: null,
  parent_id: null,
  is_active: true,
  sort_order: i,
  created_at: null,
  updated_at: null,
}));

/**
 * モバイル専用タグチップ行。タイムライン下部の固定フッターに配置される想定。
 *
 * - sort_order 昇順で並ぶ（PC sidebar と完全一致）
 * - is_active === false のタグは除外
 * - 葉タグは suffix のみ表示（"仕事:会議" → "会議"）
 * - タップで bottom sheet popover（既存 TagEntryCreatePopover を isMobile=true で再利用）
 */
const meta = {
  title: 'Product/Features/Calendar/Filter/TagFilter/TagChipRow',
  component: TagChipRow,
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'mobile1' },
    a11y: { test: 'todo' },
  },
  decorators: [
    (Story) => (
      <div className="bg-background w-full">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TagChipRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default: 7 タグ、ほぼ画面に収まる */
export const Default: Story = {
  parameters: {
    trpcMocks: { 'tags.list': { data: MOCK_TAGS }, 'entries.list': [] },
  },
};

/** ManyTags: 30 タグ、横スクロールで全件アクセス可能 */
export const ManyTags: Story = {
  parameters: {
    trpcMocks: { 'tags.list': { data: MANY_TAGS }, 'entries.list': [] },
  },
};

/** Empty: タグゼロ → chip 行ごと非描画（null を返す） */
export const Empty: Story = {
  parameters: {
    trpcMocks: { 'tags.list': { data: [] }, 'entries.list': [] },
  },
};

function FooterPreview({ tags }: { tags: Tag[] }) {
  return (
    <StoryTRPCProvider mocks={{ 'tags.list': { data: tags }, 'entries.list': [] }}>
      <div className="border-border-subtle bg-background relative h-20 overflow-hidden rounded-lg border">
        <TagChipRow className="absolute" />
      </div>
    </StoryTRPCProvider>
  );
}

/** AllPatterns: fixed footer 化した mobile tag row の主要状態を一覧表示 */
export const AllPatterns: Story = {
  render: () => (
    <div className="bg-background space-y-4 p-4">
      <FooterPreview tags={MOCK_TAGS} />
      <FooterPreview tags={MANY_TAGS} />
      <FooterPreview tags={[]} />
    </div>
  ),
};
