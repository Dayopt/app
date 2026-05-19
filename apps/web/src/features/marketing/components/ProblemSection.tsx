import { Container } from '@/components/ui/container';
import { CalendarX, Clock, Shuffle } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

interface ProblemSectionProps {
  locale: string;
}

const problemIcons = {
  separateApps: Shuffle,
  plansFallApart: CalendarX,
  noReview: Clock,
};

const problemKeys = ['separateApps', 'plansFallApart', 'noReview'] as const;

export async function ProblemSection({ locale }: ProblemSectionProps) {
  const t = await getTranslations({ locale, namespace: 'marketing' });

  return (
    <section className="bg-muted py-20">
      <Container>
        <h2 className="text-foreground mx-auto max-w-3xl text-center text-3xl font-medium tracking-tight sm:text-4xl">
          {t('problem.title')}
        </h2>

        <div className="mx-auto mt-12 grid max-w-5xl grid-cols-1 gap-8 sm:grid-cols-3">
          {problemKeys.map((key) => {
            const Icon = problemIcons[key];
            return (
              <div key={key} className="flex flex-col items-center text-center">
                <div className="bg-background inline-flex size-10 items-center justify-center rounded-lg">
                  <Icon className="text-muted-foreground size-5" />
                </div>
                <h3 className="text-foreground mt-4 text-base font-medium">
                  {t(`problem.items.${key}.title`)}
                </h3>
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                  {t(`problem.items.${key}.description`)}
                </p>
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
