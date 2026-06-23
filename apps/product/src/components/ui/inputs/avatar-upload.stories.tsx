import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';

import { AvatarUpload } from './avatar-upload';

const meta = {
  title: 'Components/UI/Inputs/AvatarUpload',
  component: AvatarUpload,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  // 各 story は AvatarUploadDemo で自前の onUpload を渡すため、必須 prop の既定値のみ満たす
  args: { onUpload: async () => {} },
} satisfies Meta<typeof AvatarUpload>;

export default meta;
type Story = StoryObj<typeof meta>;

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
