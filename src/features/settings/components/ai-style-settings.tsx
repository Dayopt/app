'use client';

import { useCallback, useMemo } from 'react';

import { useTranslations } from 'next-intl';

import { SectionCard } from '@/components/common/SectionCard';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useAutoSaveSettings } from '@/hooks/useAutoSaveSettings';
import { CACHE_5_MINUTES } from '@/lib/date';
import { cn } from '@/lib/utils';
import { api } from '@/platform/trpc';

import type { AICommunicationStyle } from '../types/personalization';
import { AI_COMMUNICATION_STYLES } from '../types/personalization';

interface AIStyleAutoSaveSettings {
  aiStyle: AICommunicationStyle;
  aiCustomStylePrompt: string;
}

/**
 * AIコミュニケーションスタイル設定コンポーネント
 *
 * コーチ/アナリスト/フレンドリー/カスタムの4択
 * カスタム選択時はプロンプト入力を表示
 */
export function AIStyleSettings() {
  const t = useTranslations();
  const utils = api.useUtils();

  const { data: dbSettings, isPending } = api.userSettings.get.useQuery(undefined, {
    staleTime: CACHE_5_MINUTES,
  });

  const updateMutation = api.userSettings.update.useMutation({
    onSuccess: () => {
      utils.userSettings.get.invalidate();
    },
  });

  const initialValues = useMemo(
    () => ({
      aiStyle: (dbSettings?.personalization?.aiStyle ?? 'coach') as AICommunicationStyle,
      aiCustomStylePrompt: dbSettings?.personalization?.aiCustomStylePrompt ?? '',
    }),
    [dbSettings?.personalization?.aiStyle, dbSettings?.personalization?.aiCustomStylePrompt],
  );

  const autoSave = useAutoSaveSettings<AIStyleAutoSaveSettings>({
    initialValues,
    onSave: async (values) => {
      await updateMutation.mutateAsync({
        aiCommunicationStyle: values.aiStyle,
        aiCustomStylePrompt: values.aiCustomStylePrompt,
      });
    },
    successMessage: t('settings.aiStyle.settingsSaved'),
    debounceMs: 800,
  });

  const handleStyleChange = useCallback(
    (value: string) => {
      autoSave.updateValue('aiStyle', value as AICommunicationStyle);
    },
    [autoSave],
  );

  const handleCustomPromptChange = useCallback(
    (value: string) => {
      autoSave.updateValue('aiCustomStylePrompt', value);
    },
    [autoSave],
  );

  if (isPending) {
    return (
      <SectionCard title={t('settings.aiStyle.title')}>
        <Skeleton className="mb-4 h-4 w-64" />
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard title={t('settings.aiStyle.title')}>
      <p className="text-muted-foreground mb-4 text-sm">{t('settings.aiStyle.description')}</p>

      <RadioGroup
        value={autoSave.values.aiStyle}
        onValueChange={handleStyleChange}
        className="space-y-3"
      >
        {AI_COMMUNICATION_STYLES.map((style) => (
          <StyleCard key={style} style={style} isSelected={autoSave.values.aiStyle === style} />
        ))}
      </RadioGroup>

      {autoSave.values.aiStyle === 'custom' && (
        <div className="mt-4">
          <Label htmlFor="custom-prompt" className="text-sm font-normal">
            {t('settings.aiStyle.customPromptLabel')}
          </Label>
          <Textarea
            id="custom-prompt"
            value={autoSave.values.aiCustomStylePrompt}
            onChange={(e) => handleCustomPromptChange(e.target.value)}
            placeholder={t('settings.aiStyle.customPromptPlaceholder')}
            className="mt-2 min-h-20 resize-none text-sm"
            rows={3}
          />
        </div>
      )}
    </SectionCard>
  );
}

interface StyleCardProps {
  style: AICommunicationStyle;
  isSelected: boolean;
}

function StyleCard({ style, isSelected }: StyleCardProps) {
  const t = useTranslations();

  return (
    <Label
      htmlFor={`ai-style-${style}`}
      className={cn(
        'border-border flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors',
        isSelected && 'border-primary bg-state-active',
      )}
    >
      <RadioGroupItem value={style} id={`ai-style-${style}`} className="mt-0.5" />
      <div className="flex-1">
        <div className="text-foreground text-sm font-normal">{t(`settings.aiStyle.${style}`)}</div>
        <div className="text-muted-foreground text-xs">{t(`settings.aiStyle.${style}Desc`)}</div>
      </div>
    </Label>
  );
}
