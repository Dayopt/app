/**
 * オンボーディングページ（Composition Layer）
 *
 * features/onboarding の OnboardingWizard に
 * features/chronotype のクイズ・定数を接続する。
 */
'use client';

import { useCallback, useMemo } from 'react';

import { TRPCClientError } from '@trpc/client';
import { useLocale, useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import {
  CHRONOTYPE_EMOJI,
  CHRONOTYPE_SELECTABLE_TYPES,
  ChronotypeQuiz,
} from '@/features/chronotype';
import { OnboardingWizard } from '@/features/onboarding';
import { logger } from '@/lib/logger';
import { toast } from '@/lib/toast';
import { useRouter } from '@/platform/i18n/navigation';
import { api } from '@/platform/trpc';

import type { QuizCallbacks } from '@/features/onboarding';
import type { PresetChronotypeType } from '@/types/chronotype';

export default function OnboardingPage() {
  const router = useRouter();
  const t = useTranslations();
  const locale = useLocale();

  // Fetch profile for pre-filling name
  const {
    data: profile,
    isError: isProfileError,
    refetch: refetchProfile,
  } = api.onboarding.getProfile.useQuery();

  // Complete mutation
  const completeMutation = api.onboarding.complete.useMutation();

  // Chronotype card data
  const cardData = useMemo(
    () =>
      CHRONOTYPE_SELECTABLE_TYPES.map((type) => ({
        type,
        emoji: CHRONOTYPE_EMOJI[type],
      })),
    [],
  );

  // Wizard complete handler
  const handleComplete = useCallback(
    async (data: { fullName: string; chronotypeType: PresetChronotypeType | null }) => {
      try {
        // 1. Save onboarding data (including current locale as preferred_locale)
        await completeMutation.mutateAsync({
          fullName: data.fullName,
          chronotypeType: data.chronotypeType ?? undefined,
          locale: locale === 'ja' ? 'ja' : 'en',
        });

        // 2. Navigate to calendar (middleware will set httpOnly cookie on next request)
        router.push('/calendar/day');
      } catch (error) {
        logger.error('Onboarding complete failed:', error);

        if (error instanceof TRPCClientError) {
          const code = error.data?.code;
          if (code === 'UNAUTHORIZED') {
            toast.error(t('onboarding.error.sessionExpired'));
            return;
          }
        }

        // ネットワークエラー判定
        if (error instanceof TypeError && error.message === 'Failed to fetch') {
          toast.error(t('onboarding.error.networkError'));
          return;
        }

        toast.error(t('onboarding.error.completeFailed'));
      }
    },
    [completeMutation, router, t, locale],
  );

  // Quiz component factory — receives wizard callbacks so quiz can update wizard state
  const renderQuiz = useCallback(
    ({ onChronotypeSelect, onHideQuiz }: QuizCallbacks) => (
      <ChronotypeQuiz onComplete={onChronotypeSelect} onCancel={onHideQuiz} />
    ),
    [],
  );

  if (isProfileError) {
    return (
      <div className="w-full max-w-md space-y-4 px-4 text-center">
        <p className="text-destructive text-sm">{t('onboarding.error.profileLoadFailed')}</p>
        <Button variant="outline" size="sm" onClick={() => refetchProfile()}>
          {t('onboarding.error.retry')}
        </Button>
      </div>
    );
  }

  return (
    <OnboardingWizard
      initialName={profile?.full_name ?? ''}
      cardData={cardData}
      renderQuiz={renderQuiz}
      onComplete={handleComplete}
      isCompleting={completeMutation.isPending}
    />
  );
}
