'use client';

import { useCallback, useMemo, useState } from 'react';

import { ExternalLink, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { CACHE_5_MINUTES } from '@/lib/date';
import { cn } from '@/lib/utils';
import { api } from '@/platform/trpc';
import { useCalendarSettingsStore } from '@/stores/useCalendarSettingsStore';

import { CHRONOTYPE_EMOJI, CHRONOTYPE_SELECTABLE_TYPES } from '../lib/constants';
import { getDeepHours, getEaseHours, getPresetChronotypeProfile } from '../lib/utils';

import { LabeledRow } from '@/components/common/LabeledRow';
import { SectionCard } from '@/components/common/SectionCard';
import { useAutoSaveSettings } from '@/hooks/useAutoSaveSettings';
import { DEFAULT_CHRONOTYPE_SETTINGS } from '@/lib/chronotype-defaults';

import { ChronotypeQuiz } from './chronotype-quiz';

import type {
  ChronotypeSettings as ChronotypeSettingsState,
  ChronotypeType,
  PresetChronotypeType,
  ProductivityZone,
} from '@/types/chronotype';

type ViewState = 'idle' | 'quiz';

interface ChronotypeAutoSaveSettings {
  chronotype: ChronotypeSettingsState;
}

/** 活動時間帯のタイムライン（6:00–22:00、deep/ease のみ色分け） */
function TimelineBar({ zones }: { zones: ProductivityZone[] }) {
  const t = useTranslations();
  const START = 6;
  const END = 22;

  const segments = useMemo(() => {
    const result: Array<{ hour: number; level: ProductivityZone['level'] }> = [];
    for (let hour = START; hour < END; hour++) {
      const zone = zones.find((item) => {
        if (item.startHour <= item.endHour) {
          return hour >= item.startHour && hour < item.endHour;
        }
        return hour >= item.startHour || hour < item.endHour;
      });
      result.push({ hour, level: zone?.level ?? 'warmup' });
    }
    return result;
  }, [zones]);

  const deepZone = zones.find((z) => z.level === 'deep');
  const easeZone = zones.find((z) => z.level === 'ease');

  return (
    <div className="space-y-1">
      <div className="relative flex h-10 overflow-hidden rounded-lg">
        {segments.map((segment, index) => (
          <div
            key={index}
            className={cn(
              'relative flex-1',
              segment.level === 'deep' && 'bg-chronotype-deep-tint',
              segment.level === 'ease' && 'bg-chronotype-ease-tint',
              segment.level !== 'deep' && segment.level !== 'ease' && 'bg-muted',
            )}
          />
        ))}
        {deepZone && (
          <span
            className="text-chronotype-deep pointer-events-none absolute top-1/2 -translate-y-1/2 text-xs font-bold uppercase"
            style={{
              left: `${((Math.max(deepZone.startHour, START) - START) / (END - START)) * 100 + 1}%`,
            }}
          >
            {t('settings.chronotype.levels.deep')}
          </span>
        )}
        {easeZone && (
          <span
            className="text-chronotype-ease pointer-events-none absolute top-1/2 -translate-y-1/2 text-xs font-bold uppercase"
            style={{
              left: `${((Math.max(easeZone.startHour, START) - START) / (END - START)) * 100 + 1}%`,
            }}
          >
            {t('settings.chronotype.levels.ease')}
          </span>
        )}
      </div>

      <div className="text-muted-foreground flex justify-between text-xs">
        {[6, 9, 12, 15, 18, 21].map((hour) => (
          <span key={hour}>{hour}:00</span>
        ))}
      </div>
    </div>
  );
}

/** タイプ選択カード（4 カード横並び） */
function TypeCard({
  type,
  isSelected,
  onSelect,
}: {
  type: PresetChronotypeType;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations();
  const profile = getPresetChronotypeProfile(type);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex flex-1 flex-col items-center gap-1 rounded-2xl border p-4 transition-colors',
        isSelected
          ? 'border-border-subtle bg-card shadow-sm'
          : 'border-border hover:border-foreground/30',
      )}
    >
      <span className="text-2xl">{CHRONOTYPE_EMOJI[type]}</span>
      <span className="text-sm font-bold">{profile?.name}</span>
      <span className="text-muted-foreground text-xs">
        {t(`settings.chronotype.shortDesc.${type}`)}
      </span>
    </button>
  );
}

/** クロノタイプ設定パネル */
export function ChronotypeSettings() {
  const t = useTranslations();
  const utils = api.useUtils();
  const updateStoreSettings = useCalendarSettingsStore((state) => state.updateSettings);

  const { data: dbSettings, isPending } = api.userSettings.get.useQuery(undefined, {
    staleTime: CACHE_5_MINUTES,
  });

  const updateMutation = api.userSettings.update.useMutation({
    onSuccess: () => {
      utils.userSettings.get.invalidate();
    },
  });

  const dbChronotype = dbSettings?.chronotype;
  const initialValues = useMemo(
    () => ({
      chronotype: {
        ...DEFAULT_CHRONOTYPE_SETTINGS,
        enabled: dbChronotype?.enabled ?? DEFAULT_CHRONOTYPE_SETTINGS.enabled,
        type: (dbChronotype?.type as ChronotypeType) ?? DEFAULT_CHRONOTYPE_SETTINGS.type,
      },
    }),
    [dbChronotype?.enabled, dbChronotype?.type],
  );

  const autoSave = useAutoSaveSettings<ChronotypeAutoSaveSettings>({
    initialValues,
    onSave: async (values) => {
      await updateMutation.mutateAsync({
        chronotypeEnabled: values.chronotype.enabled,
        chronotypeType: values.chronotype.type,
      });
    },
    successMessage: t('settings.chronotype.settingsSaved'),
    debounceMs: 800,
  });

  const isEnabled = autoSave.values.chronotype.enabled;
  const selectedType = autoSave.values.chronotype.type;
  const selectedProfile = getPresetChronotypeProfile(selectedType);

  const [view, setView] = useState<ViewState>('idle');

  const handleToggle = useCallback(
    (checked: boolean) => {
      const nextChronotype = {
        ...autoSave.values.chronotype,
        enabled: checked,
      };
      updateStoreSettings({ chronotype: nextChronotype });
      autoSave.updateValue('chronotype', nextChronotype);
    },
    [autoSave, updateStoreSettings],
  );

  const handleSelectType = useCallback(
    (type: PresetChronotypeType) => {
      const nextChronotype = {
        ...autoSave.values.chronotype,
        enabled: true,
        type: type as ChronotypeType,
      };
      updateStoreSettings({ chronotype: nextChronotype });
      autoSave.updateValue('chronotype', nextChronotype);
      setView('idle');
    },
    [autoSave, updateStoreSettings],
  );

  const handleQuizComplete = useCallback(
    (type: PresetChronotypeType) => {
      handleSelectType(type);
    },
    [handleSelectType],
  );

  const handleStartQuiz = useCallback(() => {
    setView('quiz');
  }, []);

  const handleCancelQuiz = useCallback(() => {
    setView('idle');
  }, []);

  if (isPending) {
    return (
      <SectionCard title={t('settings.chronotype.title')}>
        <Skeleton className="h-12 w-full rounded-lg" />
      </SectionCard>
    );
  }

  if (view === 'quiz') {
    return (
      <SectionCard title={t('settings.chronotype.quiz.title')}>
        <ChronotypeQuiz onComplete={handleQuizComplete} onCancel={handleCancelQuiz} />
      </SectionCard>
    );
  }

  return (
    <SectionCard title={t('settings.chronotype.title')}>
      <div className="space-y-6">
        {/* ラベル行: テキスト + Switch */}
        <LabeledRow
          label={t('settings.chronotype.subtitle')}
          description={t('settings.chronotype.description')}
        >
          <Switch
            checked={isEnabled}
            onCheckedChange={handleToggle}
            aria-label={t('settings.chronotype.subtitle')}
          />
        </LabeledRow>

        {/* タイプ選択: 4 カード横並び */}
        <div className="flex gap-2">
          {CHRONOTYPE_SELECTABLE_TYPES.map((type) => (
            <TypeCard
              key={type}
              type={type}
              isSelected={isEnabled && selectedType === type}
              onSelect={() => handleSelectType(type)}
            />
          ))}
        </div>

        {/* enabled 時のみ: 説明 + タイムライン + 結果カード */}
        {isEnabled && selectedProfile ? (
          <>
            <p className="text-muted-foreground text-sm">{selectedProfile.description}</p>

            <TimelineBar zones={selectedProfile.productivityZones} />

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-chronotype-deep-tint flex items-center gap-4 rounded-2xl p-4">
                <span className="bg-chronotype-deep/20 text-chronotype-deep flex size-8 shrink-0 items-center justify-center rounded-lg text-base">
                  ↗
                </span>
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs leading-none">
                    {t('settings.chronotype.deepTime')}
                  </p>
                  <p className="text-sm leading-tight font-bold">
                    {getDeepHours(selectedProfile.productivityZones)}
                  </p>
                  <p className="text-muted-foreground text-xs leading-none">
                    {t('settings.chronotype.deepTimeHint')}
                  </p>
                </div>
              </div>
              <div className="bg-chronotype-ease-tint flex items-center gap-4 rounded-2xl p-4">
                <span className="bg-chronotype-ease/20 text-chronotype-ease flex size-8 shrink-0 items-center justify-center rounded-lg text-base">
                  ↘
                </span>
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs leading-none">
                    {t('settings.chronotype.easeTime')}
                  </p>
                  <p className="text-sm leading-tight font-bold">
                    {getEaseHours(selectedProfile.productivityZones)}
                  </p>
                  <p className="text-muted-foreground text-xs leading-none">
                    {t('settings.chronotype.easeTimeHint')}
                  </p>
                </div>
              </div>
            </div>
          </>
        ) : null}

        {/* フッター（常に表示） */}
        <div className="flex items-center justify-between">
          <a
            href="https://sleepdoctor.com/pages/chronotypes"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs underline transition-colors"
          >
            <span>{t('settings.chronotype.learnMore')}</span>
            <ExternalLink className="h-3 w-3" />
          </a>
          <Button variant="outline" size="sm" onClick={handleStartQuiz}>
            <RefreshCw />
            {t('settings.chronotype.quizAction')}
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}
