import { Container } from '@/components/ui/container';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@dayopt/ui';
import { Brain, Flame, Target } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

interface FeaturesSectionProps {
  locale: string;
}

const featureIcons = {
  accuracyScore: Target,
  energyMapping: Flame,
  aiReflection: Brain,
};

const featureKeys = ['accuracyScore', 'energyMapping', 'aiReflection'] as const;

export async function FeaturesSection({ locale }: FeaturesSectionProps) {
  const t = await getTranslations({ locale, namespace: 'marketing' });

  return (
    <section id="features" className="bg-muted py-24">
      <Container>
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-foreground text-3xl font-medium tracking-tight sm:text-4xl">
            {t('features.grid.title')}
          </h2>
          <p className="text-muted-foreground mt-4 mb-16 text-lg">{t('features.grid.subtitle')}</p>
        </div>

        <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-3">
          {featureKeys.map((key) => {
            const Icon = featureIcons[key];
            return (
              <Card
                key={key}
                className="border-border bg-background surface-flat hover:shadow-elevation-raised rounded-2xl shadow-none transition-shadow"
              >
                <CardHeader>
                  <div className="bg-muted mb-4 inline-flex size-12 items-center justify-center rounded-lg">
                    <Icon className="text-primary size-6" />
                  </div>
                  <CardTitle className="text-xl">{t(`features.items.${key}.title`)}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base leading-relaxed">
                    {t(`features.items.${key}.description`)}
                  </CardDescription>
                  <p className="text-muted-foreground mt-4 text-sm italic">
                    {t(`features.items.${key}.example`)}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Integrations */}
        <div className="mx-auto mt-12 max-w-3xl text-center">
          <p className="text-muted-foreground text-sm">
            {t('features.integrations.title')}:{' '}
            {(t.raw('features.integrations.items') as string[]).join(' · ')}
          </p>
        </div>
      </Container>
    </section>
  );
}
