import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';

import { Avatar, AvatarFallback, AvatarImage } from '@dayopt/components';

import { AvatarUpload } from './avatar-upload';

const meta = {
  title: 'Components/UI/Display/Avatar',
  component: Avatar,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

/** サイドバー用（xs相当 24px） */
export const Default: Story = {
  render: () => (
    <Avatar size="xs">
      <AvatarFallback className="bg-foreground text-background">T</AvatarFallback>
    </Avatar>
  ),
};

/** アカウント設定（xl 64px） */
export const AccountSettings: Story = {
  render: () => (
    <Avatar size="xl">
      <AvatarImage src="https://github.com/shadcn.png" alt="User" />
      <AvatarFallback className="bg-foreground text-background">T</AvatarFallback>
    </Avatar>
  ),
};

// ---------------------------------------------------------------------------
// AllPatterns
// ---------------------------------------------------------------------------

/** 全パターン一覧 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-8">
      {/* 使用中のサイズ */}
      <section>
        <h3 className="text-foreground mb-4 text-sm">Sizes (in use)</h3>
        <div className="flex items-end gap-6">
          {[
            { size: 'xs' as const, label: '20px', desc: 'サイドバー' },
            { size: 'sm' as const, label: '32px', desc: 'コメント・通知' },
            { size: 'default' as const, label: '40px', desc: '標準UI' },
            { size: 'lg' as const, label: '48px', desc: 'プロフィールカード' },
            { size: 'xl' as const, label: '64px', desc: 'アカウント設定' },
            { size: '2xl' as const, label: '96px', desc: 'プロフィール編集' },
            { size: '3xl' as const, label: '120px', desc: 'アバター変更' },
          ].map(({ size, label, desc }) => (
            <div key={size} className="flex flex-col items-center gap-1">
              <Avatar size={size}>
                <AvatarFallback className="bg-foreground text-background">T</AvatarFallback>
              </Avatar>
              <span className="text-muted-foreground text-xs">
                {size} {label}
              </span>
              <span className="text-muted-foreground text-xs">{desc}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 画像 / フォールバック */}
      <section>
        <h3 className="text-foreground mb-4 text-sm">Image / Fallback</h3>
        <div className="flex items-center gap-4">
          <Avatar size="xl">
            <AvatarImage src="https://github.com/shadcn.png" alt="User" />
            <AvatarFallback>CN</AvatarFallback>
          </Avatar>
          <Avatar size="xl">
            <AvatarFallback className="bg-foreground text-background">T</AvatarFallback>
          </Avatar>
        </div>
      </section>
    </div>
  ),
};

// ---------------------------------------------------------------------------
// AvatarUpload
// ---------------------------------------------------------------------------

function AvatarUploadDemo({ initialUrl }: { initialUrl?: string }) {
  const [isUploading, setIsUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialUrl || null);

  const handleUpload = async (file: File) => {
    setIsUploading(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const url = URL.createObjectURL(file);
    setAvatarUrl(url);
    setIsUploading(false);
  };

  const handleRemove = async () => {
    setIsUploading(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    setAvatarUrl(null);
    setIsUploading(false);
  };

  return (
    <AvatarUpload
      currentAvatarUrl={avatarUrl}
      onUpload={handleUpload}
      onRemove={handleRemove}
      loading={isUploading}
      size="3xl"
    />
  );
}

/** アップロード（空状態） */
export const Upload: Story = {
  // label: hidden file input inside AvatarUpload component
  parameters: { a11y: { test: 'todo' } },
  render: () => <AvatarUploadDemo />,
};

/** アップロード（画像あり） */
export const UploadWithImage: Story = {
  // label: hidden file input inside AvatarUpload component
  parameters: { a11y: { test: 'todo' } },
  render: () => <AvatarUploadDemo initialUrl="https://github.com/shadcn.png" />,
};
