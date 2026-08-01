'use client';

import { Button } from '@dayopt/components';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface CopyCodeButtonProps {
  code: string;
}

export function CopyCodeButton({ code }: CopyCodeButtonProps) {
  const [copied, setCopied] = useState(false);
  const t = useTranslations('common.actions');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // コピー失敗時はUIで「Copied!」が表示されないため対応不要
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      className="bg-container text-muted-foreground hover:bg-muted hover:text-foreground h-auto rounded-lg px-2 py-1 text-xs"
      onClick={handleCopy}
    >
      {copied ? t('copied') : t('copy')}
    </Button>
  );
}
