'use client';

import { useCallback, useMemo, useState } from 'react';

import { Check, ChevronDown, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { SectionCard } from '@/components/common/SectionCard';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useAutoSaveSettings } from '@/hooks/useAutoSaveSettings';
import { CACHE_5_MINUTES } from '@/lib/date';
import { cn } from '@/lib/utils';
import { api } from '@/platform/trpc';

import type { PersonalizationCategory, PersonalizationValues } from '../types/personalization';
import { PERSONALIZATION_CATEGORIES } from '../types/personalization';

interface ValuesAutoSaveSettings {
  personalizationValues: PersonalizationValues;
}

/**
 * 価値評定スケール（ACT 12領域）
 *
 * 折りたたみ形式。記入済みを上に、未記入を下にソート。
 * 各領域は問いかけ形式のプロンプトで記入を促す。
 */
export function ValuesSettings() {
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
      personalizationValues: migrateValues(
        (dbSettings?.personalization?.values ?? {}) as Record<
          string,
          { text: string; importance?: number; priority?: number }
        >,
      ),
    }),
    [dbSettings?.personalization?.values],
  );

  const autoSave = useAutoSaveSettings<ValuesAutoSaveSettings>({
    initialValues,
    onSave: async (values) => {
      await updateMutation.mutateAsync({
        personalizationValues: values.personalizationValues,
      });
    },
    successMessage: t('settings.values.settingsSaved'),
    debounceMs: 800,
  });

  const handleTextChange = useCallback(
    (category: PersonalizationCategory, text: string) => {
      const current = autoSave.values.personalizationValues[category];
      autoSave.updateValue('personalizationValues', {
        ...autoSave.values.personalizationValues,
        [category]: {
          text,
          importance: current?.importance ?? 5,
        },
      });
    },
    [autoSave],
  );

  const handleImportanceChange = useCallback(
    (category: PersonalizationCategory, importance: number) => {
      const current = autoSave.values.personalizationValues[category];
      autoSave.updateValue('personalizationValues', {
        ...autoSave.values.personalizationValues,
        [category]: {
          text: current?.text ?? '',
          importance,
        },
      });
    },
    [autoSave],
  );

  const isFilled = useCallback(
    (category: PersonalizationCategory) => {
      const value = autoSave.values.personalizationValues[category];
      return Boolean(value?.text?.trim());
    },
    [autoSave.values.personalizationValues],
  );

  const sortedCategories = useMemo(() => {
    return [...PERSONALIZATION_CATEGORIES].sort((a, b) => {
      const aFilled = isFilled(a) ? 0 : 1;
      const bFilled = isFilled(b) ? 0 : 1;
      return aFilled - bFilled;
    });
  }, [isFilled]);

  const filledCount = useMemo(() => PERSONALIZATION_CATEGORIES.filter(isFilled).length, [isFilled]);

  if (isPending) {
    return (
      <SectionCard title={t('settings.values.title')}>
        <div className="space-y-4">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard title={t('settings.values.title')}>
      <p className="text-muted-foreground mb-2 text-sm">{t('settings.values.description')}</p>
      <p className="text-muted-foreground mb-4 text-xs">
        {t('settings.values.filledCount', {
          count: filledCount,
          total: PERSONALIZATION_CATEGORIES.length,
        })}
      </p>

      <div className="space-y-1">
        {sortedCategories.map((category) => {
          const value = autoSave.values.personalizationValues[category];
          const filled = isFilled(category);
          return (
            <ValueCategoryCollapsible
              key={category}
              category={category}
              text={value?.text ?? ''}
              importance={value?.importance ?? 5}
              filled={filled}
              onTextChange={handleTextChange}
              onImportanceChange={handleImportanceChange}
            />
          );
        })}
      </div>
    </SectionCard>
  );
}

/**
 * 旧データ（priority: 1-5）から新データ（importance: 1-10）へのマイグレーション
 */
function migrateValues(
  raw: Record<string, { text: string; importance?: number; priority?: number }>,
): PersonalizationValues {
  const result: PersonalizationValues = {};
  for (const [key, value] of Object.entries(raw)) {
    result[key as PersonalizationCategory] = {
      text: value.text,
      importance: value.importance ?? (value.priority ? value.priority * 2 : 5),
    };
  }
  return result;
}

interface ValueCategoryCollapsibleProps {
  category: PersonalizationCategory;
  text: string;
  importance: number;
  filled: boolean;
  onTextChange: (category: PersonalizationCategory, text: string) => void;
  onImportanceChange: (category: PersonalizationCategory, importance: number) => void;
}

function ValueCategoryCollapsible({
  category,
  text,
  importance,
  filled,
  onTextChange,
  onImportanceChange,
}: ValueCategoryCollapsibleProps) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="hover:bg-state-hover flex w-full items-center gap-2 rounded-lg px-4 py-2 text-left transition-colors">
        {open ? (
          <ChevronDown className="text-muted-foreground size-4 shrink-0" />
        ) : (
          <ChevronRight className="text-muted-foreground size-4 shrink-0" />
        )}
        <span className="text-foreground flex-1 text-sm">
          {t(`settings.values.categories.${category}`)}
        </span>
        {filled && (
          <span className="text-success flex items-center gap-1 text-xs">
            <Check className="size-3" />
            {t('settings.values.filled')}
          </span>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-4 px-4 pt-1 pb-4 pl-8">
          <p className="text-muted-foreground text-xs">
            {t(`settings.values.categories.${category}Prompt`)}
          </p>
          <Textarea
            value={text}
            onChange={(e) => onTextChange(category, e.target.value)}
            placeholder={t('settings.values.placeholder')}
            className="min-h-15 resize-none text-sm"
            rows={2}
          />
          <div className="flex justify-end">
            <ImportanceDots value={importance} onChange={(v) => onImportanceChange(category, v)} />
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface ImportanceDotsProps {
  value: number;
  onChange: (value: number) => void;
}

/**
 * 1-10の重要度ドットバー
 */
function ImportanceDots({ value, onChange }: ImportanceDotsProps) {
  const t = useTranslations();

  return (
    <div
      className="flex shrink-0 items-center gap-1"
      role="group"
      aria-label={t('settings.values.importance')}
    >
      {Array.from({ length: 10 }, (_, i) => i + 1).map((dot) => (
        <button
          key={dot}
          type="button"
          className={cn(
            '-m-1 size-3 rounded-full bg-clip-content p-2 transition-colors',
            dot <= value ? 'bg-primary' : 'bg-muted',
          )}
          onClick={() => onChange(dot)}
          aria-label={t('settings.values.setImportance', { value: dot })}
        />
      ))}
    </div>
  );
}
