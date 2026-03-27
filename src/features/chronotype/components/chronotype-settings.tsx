'use client';

import { useCallback, useMemo, useState } from 'react';

import { ExternalLink, RefreshCw, Stethoscope } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CACHE_5_MINUTES } from '@/lib/date';
import { cn } from '@/lib/utils';
import { api } from '@/platform/trpc';
import { useCalendarSettingsStore } from '@/stores/useCalendarSettingsStore';

import { CHRONOTYPE_EMOJI, CHRONOTYPE_SELECTABLE_TYPES } from '../lib/constants';
import { getDipHours, getPeakHours, getPresetChronotypeProfile } from '../lib/utils';

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

type ViewState = 'idle' | 'quiz' | 'empty';

interface ChronotypeAutoSaveSettings {
  chronotype: ChronotypeSettingsState;
}

/** 活動時間帯のタイムライン（6:00–22:00、peak/dip のみ色分け） */
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

  const peakZone = zones.find((z) => z.level === 'peak');
  const dipZone = zones.find((z) => z.level === 'dip');

  return (
    <div className="space-y-1">
      <div className="relative flex h-10 overflow-hidden rounded-lg">
        {segments.map((segment, index) => (
          <div
            key={index}
            className={cn(
              'relative flex-1',
              segment.level === 'peak' && 'bg-chronotype-peak-tint',
              segment.level === 'dip' && 'bg-chronotype-dip-tint',
              segment.level !== 'peak' && segment.level !== 'dip' && 'bg-muted',
            )}
          />
        ))}
        {/* ゾーンラベル */}
        {peakZone && (
          <span
            className="text-chronotype-peak pointer-events-none absolute top-1/2 -translate-y-1/2 text-xs font-bold uppercase"
            style={{
              left: `${((Math.max(peakZone.startHour, START) - START) / (END - START)) * 100 + 1}%`,
            }}
          >
            {t('settings.chronotype.levels.peak')}
          </span>
        )}
        {dipZone && (
          <span
            className="text-chronotype-dip pointer-events-none absolute top-1/2 -translate-y-1/2 text-xs font-bold uppercase"
            style={{
              left: `${((Math.max(dipZone.startHour, START) - START) / (END - START)) * 100 + 1}%`,
            }}
          >
            {t('settings.chronotype.levels.dip')}
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
        'flex flex-1 flex-col items-center gap-1 rounded-xl border p-3 transition-colors',
        isSelected ? 'border-foreground bg-card' : 'border-border hover:border-foreground/30',
      )}
    >
      <span className="text-2xl">{CHRONOTYPE_EMOJI[type]}</span>
      <span className="text-sm font-bold">{profile?.name}</span>
      <span className="text-muted-foreground text-xs">
        {t(`settings.chronotype.population.${type}`)}
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
  const selectedProfile = isEnabled ? getPresetChronotypeProfile(selectedType) : null;

  const initialView: ViewState = isEnabled ? 'idle' : 'empty';
  const [view, setView] = useState<ViewState>(initialView);

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
    setView(isEnabled ? 'idle' : 'empty');
  }, [isEnabled]);

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

  if (view === 'empty') {
    return (
      <SectionCard title={t('settings.chronotype.title')}>
        <div className="space-y-4 py-2">
          <p className="text-muted-foreground text-sm">{t('settings.chronotype.notDiagnosed')}</p>
          <Button variant="outline" size="sm" onClick={handleStartQuiz}>
            <Stethoscope />
            {t('settings.chronotype.diagnose')}
          </Button>
        </div>
        <div className="mt-4">
          <a
            href="https://sleepdoctor.com/pages/chronotypes"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs underline transition-colors"
          >
            <span>{t('settings.chronotype.learnMore')}</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard title={t('settings.chronotype.title')}>
      <div className="space-y-6">
        {/* タイプ選択: 4 カード横並び */}
        <div className="flex gap-2">
          {CHRONOTYPE_SELECTABLE_TYPES.map((type) => (
            <TypeCard
              key={type}
              type={type}
              isSelected={selectedType === type}
              onSelect={() => handleSelectType(type)}
            />
          ))}
        </div>

        {selectedProfile ? (
          <>
            {/* 説明 */}
            <p className="text-muted-foreground text-sm">{selectedProfile.description}</p>

            {/* タイムライン（6:00–22:00） */}
            <TimelineBar zones={selectedProfile.productivityZones} />

            {/* Peak / Dip 結果カード */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-chronotype-peak-tint flex items-center gap-3 rounded-xl p-4">
                <span className="bg-chronotype-peak/20 text-chronotype-peak flex size-8 shrink-0 items-center justify-center rounded-lg text-base">
                  ↗
                </span>
                <div className="space-y-0.5">
                  <p className="text-muted-foreground text-xs leading-none">
                    {t('settings.chronotype.peakTime')}
                  </p>
                  <p className="text-sm leading-tight font-bold">
                    {getPeakHours(selectedProfile.productivityZones)}
                  </p>
                  <p className="text-muted-foreground text-xs leading-none">
                    {t('settings.chronotype.peakTimeHint')}
                  </p>
                </div>
              </div>
              <div className="bg-chronotype-dip-tint flex items-center gap-3 rounded-xl p-4">
                <span className="bg-chronotype-dip/20 text-chronotype-dip flex size-8 shrink-0 items-center justify-center rounded-lg text-base">
                  ↘
                </span>
                <div className="space-y-0.5">
                  <p className="text-muted-foreground text-xs leading-none">
                    {t('settings.chronotype.dipTime')}
                  </p>
                  <p className="text-sm leading-tight font-bold">
                    {getDipHours(selectedProfile.productivityZones)}
                  </p>
                  <p className="text-muted-foreground text-xs leading-none">
                    {t('settings.chronotype.dipTimeHint')}
                  </p>
                </div>
              </div>
            </div>

            {/* フッター */}
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
                {t('settings.chronotype.rediagnose')}
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </SectionCard>
  );
}
