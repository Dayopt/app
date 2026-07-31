import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Container,
} from '@dayopt/components';
import { CalendarDays, Database, PlugZap } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { SectionHeader } from './SectionHeader';

interface OpenByDesignSectionProps {
  locale: string;
}

const openByDesignKeys = [
  { key: 'mcp', icon: PlugZap },
  { key: 'ical', icon: CalendarDays },
  { key: 'api', icon: Database },
] as const;

export async function OpenByDesignSection({ locale }: OpenByDesignSectionProps) {
  const t = await getTranslations({ locale, namespace: 'marketing' });

  return (
    <section className="pt-20 pb-24 sm:pt-36 sm:pb-32">
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
              <path d="M12 20h9" />
              <path d="M3.5 17.5V10a8.5 8.5 0 1 1 17 0v7.5" />
              <path d="M8 20h4" />
            </svg>
          }
          label={t('openByDesign.label')}
          headline={t('openByDesign.title')}
          subtitle={t('openByDesign.subtitle')}
        />

        <p className="text-muted-foreground mx-auto mt-6 max-w-4xl text-center text-sm leading-relaxed">
          {t('openByDesign.description')}
        </p>

        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {openByDesignKeys.map(({ key, icon: Icon }) => (
            <Card key={key} className="border-border bg-card rounded-2xl border shadow-sm">
              <CardHeader>
                <div className="bg-muted inline-flex size-10 items-center justify-center rounded-lg">
                  <Icon className="text-primary size-5" />
                </div>
                <CardTitle className="text-base font-medium tracking-[-0.02em]">
                  {t(`openByDesign.items.${key}.title`)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm leading-relaxed">
                  {t(`openByDesign.items.${key}.description`)}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </Container>
    </section>
  );
}
