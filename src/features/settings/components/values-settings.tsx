'use client';

import { useCallback, useMemo, useState } from 'react';

import { ChevronDown, Circle, CircleCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { SectionCard } from '@/lib/components/common/SectionCard';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/lib/components/ui/collapsible';
import { Skeleton } from '@/lib/components/ui/skeleton';
import { Textarea } from '@/lib/components/ui/textarea';
import { CACHE_5_MINUTES } from '@/lib/date';
import { useAutoSaveSettings } from '@/lib/hooks/useAutoSaveSettings';
import { api } from '@/lib/trpc';
import { cn } from '@/lib/utils';

import type { PersonalizationCategory, PersonalizationValues } from '../types/personalization';
import { PERSONALIZATION_CATEGORIES } from '../types/personalization';
import { CATEGORY_ICONS, EXAMPLE_CHIP_COUNTS } from './values-category-config';

interface ValuesAutoSaveSettings {
  personalizationValues: PersonalizationValues;
}

/**
 * 価値評定スケール（ACT 12領域）
 *
 * 排他アコーディオン形式。カテゴリアイコン付き。
 * 各領域は問いかけ形式のプロンプト + 例文チップで記入を促す。
 */
export function ValuesSettings() {
  const t = useTranslations();
  const utils = api.useUtils();

  const [openCategory, setOpenCategory] = useState<PersonalizationCategory | null>(null);

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

  const isFilled = useCallback(
    (category: PersonalizationCategory) => {
      const value = autoSave.values.personalizationValues[category];
      return Boolean(value?.text?.trim());
    },
    [autoSave.values.personalizationValues],
  );

  const handleToggle = useCallback((category: PersonalizationCategory) => {
    setOpenCategory((prev) => (prev === category ? null : category));
  }, []);

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
    <div className="space-y-4">
      <SectionCard
        title={t('settings.values.title')}
        className="border-b-0 pb-0"
        actions={
          filledCount > 0 ? (
            <span className="bg-muted text-muted-foreground rounded-lg px-2 py-1 text-xs">
              {t('settings.values.filledCount', {
                count: filledCount,
                total: PERSONALIZATION_CATEGORIES.length,
              })}
            </span>
          ) : undefined
        }
      >
        <p className="text-muted-foreground text-base md:text-sm">
          {t('settings.values.description')}
        </p>
      </SectionCard>

      <div className="border-border-subtle bg-card overflow-hidden rounded-lg border shadow-sm">
        {PERSONALIZATION_CATEGORIES.map((category, index) => {
          const value = autoSave.values.personalizationValues[category];
          const text = value?.text ?? '';
          const filled = isFilled(category);
          const isLast = index === PERSONALIZATION_CATEGORIES.length - 1;

          return (
            <ValueAccordionItem
              key={category}
              category={category}
              text={text}
              filled={filled}
              open={openCategory === category}
              onToggle={handleToggle}
              onTextChange={handleTextChange}
              isLast={isLast}
            />
          );
        })}
      </div>
    </div>
  );
}

/**
 * 旧データ（priority: 1-5、art キー）から新データへのマイグレーション
 */
function migrateValues(
  raw: Record<string, { text: string; importance?: number; priority?: number }>,
): PersonalizationValues {
  const result: PersonalizationValues = {};
  for (const [key, value] of Object.entries(raw)) {
    const mappedKey = key === 'art' ? 'finance' : key;
    if (!PERSONALIZATION_CATEGORIES.includes(mappedKey as PersonalizationCategory)) continue;
    if (key === 'art' && result.finance?.text) continue;
    result[mappedKey as PersonalizationCategory] = {
      text: value.text,
      importance: value.importance ?? (value.priority ? value.priority * 2 : 5),
    };
  }
  return result;
}

interface ValueAccordionItemProps {
  category: PersonalizationCategory;
  text: string;
  filled: boolean;
  open: boolean;
  onToggle: (category: PersonalizationCategory) => void;
  onTextChange: (category: PersonalizationCategory, text: string) => void;
  isLast: boolean;
}

function ValueAccordionItem({
  category,
  text,
  filled,
  open,
  onToggle,
  onTextChange,
  isLast,
}: ValueAccordionItemProps) {
  const t = useTranslations();
  const Icon = CATEGORY_ICONS[category];

  return (
    <Collapsible open={open} onOpenChange={() => onToggle(category)}>
      <CollapsibleTrigger
        className={cn(
          'hover:bg-state-hover flex min-h-11 w-full items-center gap-2 px-4 py-2 text-left transition-colors duration-150',
          !isLast && !open && 'border-border border-b',
        )}
      >
        <div className="flex size-8 shrink-0 items-center justify-center">
          <Icon className="text-muted-foreground size-5" />
        </div>

        <span className="text-foreground flex-1 text-base md:text-sm">
          {t(`settings.values.categories.${category}`)}
        </span>

        {filled && text && (
          <span className="text-muted-foreground mr-2 ml-auto hidden max-w-48 truncate text-xs sm:block">
            {text.split('\n')[0]}
          </span>
        )}

        {filled ? (
          <CircleCheck className="text-success size-4 shrink-0" />
        ) : (
          <Circle className="text-muted-foreground size-4 shrink-0" />
        )}

        <ChevronDown
          className={cn(
            'text-muted-foreground size-4 shrink-0 transition-transform duration-300',
            open && 'rotate-180',
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className={cn('space-y-4 pt-1 pr-4 pb-4 pl-14', !isLast && 'border-border border-b')}>
          <p className="text-muted-foreground text-xs">
            {t(`settings.values.categories.${category}Prompt`)}
          </p>

          <ExampleChips
            category={category}
            currentText={text}
            onInsert={(example) => {
              const newText = text.trim() ? `${text}\n${example}` : example;
              onTextChange(category, newText);
            }}
          />

          <Textarea
            value={text}
            onChange={(e) => onTextChange(category, e.target.value)}
            placeholder={t('settings.values.placeholder')}
            aria-label={t(`settings.values.categories.${category}`)}
            className="min-h-15 resize-none text-base md:text-sm"
            rows={2}
          />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface ExampleChipsProps {
  category: PersonalizationCategory;
  currentText: string;
  onInsert: (example: string) => void;
}

function ExampleChips({ category, currentText, onInsert }: ExampleChipsProps) {
  const t = useTranslations();
  const chipCount = EXAMPLE_CHIP_COUNTS[category];

  return (
    <div className="flex flex-wrap gap-2">
      {Array.from({ length: chipCount }, (_, i) => {
        const exampleText = t(`settings.values.examples.${category}.${i}`);
        const isUsed = currentText.includes(exampleText);

        return (
          <button
            key={i}
            type="button"
            onClick={() => {
              if (!isUsed) onInsert(exampleText);
            }}
            disabled={isUsed}
            className={cn(
              'rounded-lg border px-2 py-1 text-xs transition-colors duration-150',
              isUsed
                ? 'bg-state-active text-state-active-foreground cursor-default border-transparent'
                : 'border-border bg-background text-foreground hover:bg-state-hover cursor-pointer',
            )}
          >
            {exampleText}
          </button>
        );
      })}
    </div>
  );
}
