'use client';

import { Button } from '@/components/ui/button';
import { Share2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

interface ShareButtonProps {
  title: string;
  version: string;
}

export function ShareButton({ title, version }: ShareButtonProps) {
  const t = useTranslations('common.actions');

  const handleShare = async () => {
    const url = window.location.href;
    const fullTitle = `${title} - v${version}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: fullTitle, url });
      } catch {
        // User cancelled share
      }
    } else {
      try {
        await navigator.clipboard.writeText(url);
        toast.success(t('urlCopied'));
      } catch {
        toast.error(t('urlCopyFailed'));
      }
    }
  };

  return (
    <Button onClick={handleShare} variant="outline" className="gap-2">
      <Share2 className="size-4" />
      {t('share')}
    </Button>
  );
}
