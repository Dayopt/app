import { Container } from '@dayopt/components';
import { getTranslations } from 'next-intl/server';

import { LearnVisual } from './how/LearnVisual';
import { PlanVisual } from './how/PlanVisual';
import { TrackVisual } from './how/TrackVisual';
import { SectionHeader } from './SectionHeader';

interface HowSectionProps {
  locale: string;
}

const PILLARS = [
  { key: 'plan', visual: PlanVisual },
  { key: 'track', visual: TrackVisual },
  { key: 'learn', visual: LearnVisual },
] as const;

const CYCLE_DOTS = [
  { key: 'plan', color: 'bg-primary' },
  { key: 'track', color: 'bg-success' },
  { key: 'learn', color: 'bg-tag-amber' },
] as const;

export async function HowSection({ locale }: HowSectionProps) {
  const t = await getTranslations({ locale, namespace: 'marketing' });

  return (
    <section id="how" className="pt-20 pb-24 sm:pt-36 sm:pb-32">
      <Container>
        <SectionHeader
          icon={
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          }
          label={t('how.eyebrow')}
          headline={t('how.title')}
          subtitle={t('how.subtitle')}
        />

        {/* Pillars grid */}
        <div className="grid gap-6 md:grid-cols-3">
          {PILLARS.map(({ key, visual: Visual }) => (
            <div
              key={key}
              className="bg-card border-border overflow-hidden rounded-2xl border shadow-sm"
            >
              {/* Visual area */}
              <div className="h-[220px] overflow-hidden">
                <Visual />
              </div>

              {/* Content */}
              <div className="p-6">
                <h3 className="text-foreground mb-2 text-lg font-medium tracking-[-0.02em]">
                  {t(`how.pillars.${key}.title`)}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {t(`how.pillars.${key}.description`)}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Cycle indicator */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-6">
          {CYCLE_DOTS.map(({ key, color }, i) => (
            <div key={key} className="flex items-center gap-2">
              {i > 0 && (
                <span className="text-muted-foreground mr-4 text-sm" aria-hidden="true">
                  →
                </span>
              )}
              <div className={`size-2 rounded-full ${color}`} />
              <span className="text-muted-foreground text-sm font-medium">
                {t(`how.cycle.${key}`)}
              </span>
            </div>
          ))}
          <span className="text-muted-foreground text-sm" aria-hidden="true">
            →
          </span>
          <span className="text-muted-foreground text-xs italic">{t('how.cycle.repeat')}</span>
        </div>
      </Container>
    </section>
  );
}
