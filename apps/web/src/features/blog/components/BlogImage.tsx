'use client';

import { ImageIcon } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';

interface BlogImageProps {
  src: string | undefined;
  alt: string;
  priority?: boolean;
  aspectRatio?: 'default' | 'square';
  sizes?: string;
}

/**
 * 画像エラーハンドリング付きのブログ画像コンポーネント
 * PostCardをServer Componentに保つため、クライアント側の状態管理をここに分離
 */
export function BlogImage({
  src,
  alt,
  priority = false,
  aspectRatio = 'default',
  sizes = '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw',
}: BlogImageProps) {
  const [imageError, setImageError] = useState(false);

  const aspectClass = aspectRatio === 'square' ? 'aspect-square' : 'aspect-[380/214]';

  if (!src || imageError) {
    return (
      <div
        className={`bg-muted flex ${aspectClass} items-center justify-center rounded-lg transition-all duration-300`}
      >
        <ImageIcon className="text-muted-foreground size-8" />
      </div>
    );
  }

  return (
    <div
      className={`relative ${aspectClass} overflow-hidden rounded-lg transition-all duration-300`}
    >
      <Image
        src={src}
        alt={alt}
        fill
        className="rounded-lg object-cover"
        onError={() => setImageError(true)}
        priority={priority}
        sizes={sizes}
      />
    </div>
  );
}
