'use client';

import { useCallback, useMemo, useState } from 'react';

import { ExternalLink, RefreshCw, Star, Stethoscope } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CACHE_5_MINUTES } from '@/lib/date';
import { api } from '@/platform/trpc';
import { useCalendarSettingsStore } from '@/stores/useCalendarSettingsStore';

import { CHRONOTYPE_EMOJI, CHRONOTYPE_LEVEL_ORDER } from '../lib/constants';
import { getPeakHours, getPresetChronotypeProfile } from '../lib/utils';

import { SectionCard } from '@/components/common/SectionCard';
import { useAutoSaveSettings } from '@/hooks/useAutoSaveSettings';
import { DEFAULT_CHRONOTYPE_SETTINGS } from '@/lib/chronotype-defaults';

import { ChronotypeQuiz } from './chronotype-quiz';

import type {
  ChronotypeDisplayMode,
  ChronotypeSettings as ChronotypeSettingsState,
  ChronotypeType,
  PresetChronotypeType,
  ProductivityZone,
} from '@/types/chronotype';

type ViewState = 'idle' | 'quiz' | 'empty';

interface ChronotypeAutoSaveSettings {
  chronotype: ChronotypeSettingsState;
}

function TimelineBar({ zones }: { zones: ProductivityZone[] }) {
  const t = useTranslations();
  const tCommon = useTranslations('common');

  const segments = useMemo(() => {
    const result: Array<{ hour: number; level: ProductivityZone['level']; label: string }> = [];

    for (let hour = 0; hour < 24; hour++) {
      const zone = zones.find((item) => {
        if (item.startHour <= item.endHour) {
          return hour >= item.startHour && hour < item.endHour;
        }

        return hour >= item.startHour || hour < item.endHour;
      });

      result.push({
        hour,
        level: zone?.level ?? 'warmup',
        label: zone?.label ?? '',
      });
    }

    return result;
  }, [zones]);

  return (
    <div className="space-y-2">
      <div className="text-muted-foreground flex justify-between text-xs">
        <span>{tCommon('dates.hourLabel', { hour: 0 })}</span>
        <span>{tCommon('dates.hourLabel', { hour: 6 })}</span>
        <span>{tCommon('dates.hourLabel', { hour: 12 })}</span>
        <span>{tCommon('dates.hourLabel', { hour: 18 })}</span>
        <span>{tCommon('dates.hourLabel', { hour: 24 })}</span>
      </div>

      <div className="flex h-6 overflow-hidden rounded-lg">
        {segments.map((segment, index) => (
          <div
            key={index}
            className="bg-primary flex-1 transition-colors"
            title={`${segment.hour}:00 - ${segment.label}`}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-4 text-xs">
        {CHRONOTYPE_LEVEL_ORDER.map((level) => (
          <div key={level} className="flex items-center gap-1">
            <div className="bg-primary h-3 w-3 rounded" />
            <span className="text-muted-foreground">
              {t(`settings.chronotype.levels.${level}`)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** クロノタイプ設定パネル（診断・表示・変更を管理） */
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
        displayMode:
          (dbChronotype?.displayMode as ChronotypeDisplayMode) ??
          DEFAULT_CHRONOTYPE_SETTINGS.displayMode,
        opacity: dbChronotype?.opacity ?? DEFAULT_CHRONOTYPE_SETTINGS.opacity,
      },
    }),
    [dbChronotype?.displayMode, dbChronotype?.enabled, dbChronotype?.opacity, dbChronotype?.type],
  );

  const autoSave = useAutoSaveSettings<ChronotypeAutoSaveSettings>({
    initialValues,
    onSave: async (values) => {
      await updateMutation.mutateAsync({
        chronotypeEnabled: values.chronotype.enabled,
        chronotypeType: values.chronotype.type,
        chronotypeDisplayMode: values.chronotype.displayMode,
        chronotypeOpacity: values.chronotype.opacity,
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

  const handleQuizComplete = useCallback(
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

  // Quiz state
  if (view === 'quiz') {
    return (
      <SectionCard title={t('settings.chronotype.quiz.title')}>
        <ChronotypeQuiz onComplete={handleQuizComplete} onCancel={handleCancelQuiz} />
      </SectionCard>
    );
  }

  // Empty state (not diagnosed yet)
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

  // Idle state (result display)
  return (
    <SectionCard title={t('settings.chronotype.title')}>
      {selectedProfile ? (
        <div className="space-y-4">
          <div className="flex items-start gap-4">
            <span className="text-3xl">
              {CHRONOTYPE_EMOJI[selectedType as PresetChronotypeType]}
            </span>
            <div>
              <h4 className="font-normal">{selectedProfile.name}</h4>
              <p className="text-muted-foreground mt-1 text-sm">{selectedProfile.description}</p>
            </div>
          </div>

          <div className="pt-2">
            <h5 className="mb-4 text-sm font-normal">{t('settings.chronotype.timeline')}</h5>
            <TimelineBar zones={selectedProfile.productivityZones} />
          </div>

          <div className="bg-success/10 flex items-center gap-2 rounded-2xl p-4">
            <Star className="text-success h-4 w-4" />
            <div>
              <span className="text-sm font-normal">{t('settings.chronotype.peakTime')}</span>
              <span className="text-muted-foreground ml-2 text-sm">
                {getPeakHours(selectedProfile.productivityZones)}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
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
        </div>
      ) : null}
    </SectionCard>
  );
}
