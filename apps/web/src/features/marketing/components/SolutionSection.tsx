import { Container } from '@dayopt/components';
import { getTranslations } from 'next-intl/server';

interface SolutionSectionProps {
  locale: string;
}

const stepKeys = ['plan', 'execute', 'reflect'] as const;

export async function SolutionSection({ locale }: SolutionSectionProps) {
  const t = await getTranslations({ locale, namespace: 'marketing' });

  return (
    <section id="solution" className="py-24">
      <Container>
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-foreground text-3xl font-medium tracking-tight sm:text-4xl">
            {t('solution.title')}
          </h2>
          <p className="text-muted-foreground mt-4 text-lg">{t('solution.subtitle')}</p>
        </div>

        <div className="mx-auto mt-16 max-w-3xl space-y-12">
          {stepKeys.map((key) => {
            const isReflect = key === 'reflect';
            return (
              <div
                key={key}
                className={`flex items-start gap-6 ${isReflect ? 'bg-state-active/50 ring-primary/10 -mx-4 rounded-2xl p-4 ring-1 sm:-mx-6 sm:p-6' : ''}`}
              >
                <div className="text-primary shrink-0 text-3xl font-medium">
                  {t(`solution.steps.${key}.number`)}
                </div>
                <div>
                  <h3 className="text-foreground text-lg font-medium">
                    {t(`solution.steps.${key}.title`)}
                  </h3>
                  <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                    {t(`solution.steps.${key}.description`)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
