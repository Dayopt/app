'use client';

import { useCallback } from 'react';

import { useTranslations } from 'next-intl';

import { Button } from '@/lib/components/ui/button';
import { Input } from '@/lib/components/ui/input';
import { Label } from '@/lib/components/ui/label';

interface WelcomeStepProps {
  displayName: string;
  hasExistingName: boolean;
  onNameChange: (name: string) => void;
  onContinue: () => void;
}

/** オンボーディングのウェルカムステップコンポーネント（表示名の入力を担当） */
export function WelcomeStep({
  displayName,
  hasExistingName,
  onNameChange,
  onContinue,
}: WelcomeStepProps) {
  const t = useTranslations();

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && displayName.trim()) {
        onContinue();
      }
    },
    [displayName, onContinue],
  );

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-medium tracking-tight">
          {hasExistingName ? t('onboarding.welcome.confirmTitle') : t('onboarding.welcome.title')}
        </h1>
        <p className="text-muted-foreground text-sm">
          {hasExistingName
            ? t('onboarding.welcome.confirmSubtitle')
            : t('onboarding.welcome.subtitle')}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="onboarding-name">{t('onboarding.welcome.nameLabel')}</Label>
        <Input
          id="onboarding-name"
          value={displayName}
          onChange={(e) => onNameChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('onboarding.welcome.namePlaceholder')}
          autoFocus
          maxLength={100}
        />
      </div>

      <Button
        variant="primary"
        className="w-full"
        onClick={onContinue}
        disabled={!displayName.trim()}
      >
        {t('onboarding.continue')}
      </Button>
    </div>
  );
}
