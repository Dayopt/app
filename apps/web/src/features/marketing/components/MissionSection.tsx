import { Container } from '@/components/ui/container';
import { dayoptBrand } from '@dayopt/config';
import { getTranslations } from 'next-intl/server';

interface MissionSectionProps {
  locale: string;
}

const valueKeys = ['simple', 'honest', 'private'] as const;

export async function MissionSection({ locale }: MissionSectionProps) {
  const t = await getTranslations({ locale, namespace: 'marketing' });

  return (
    <section id="mission" className="py-20">
      <Container>
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-foreground text-3xl font-medium tracking-tight sm:text-4xl">
            {t('mission.title')}
          </h2>
          <p className="text-muted-foreground mx-auto mt-6 max-w-3xl text-lg leading-relaxed">
            {t('mission.description')}
          </p>
          <p className="text-muted-foreground mt-4 text-sm">{t('mission.builderNote')}</p>
          <div className="mt-4 flex items-center justify-center gap-x-4">
            <a
              href={dayoptBrand.xUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="X (Twitter)"
            >
              <svg fill="currentColor" viewBox="0 0 24 24" className="size-5">
                <path d="M13.6823 10.6218L20.2391 3H18.6854L12.9921 9.61788L8.44486 3H3.2002L10.0765 13.0074L3.2002 21H4.75404L10.7663 14.0113L15.5685 21H20.8131L13.6819 10.6218H13.6823ZM11.5541 13.0956L10.8574 12.0991L5.31391 4.16971H7.70053L12.1742 10.5689L12.8709 11.5655L18.6861 19.8835H16.2995L11.5541 13.096V13.0956Z" />
              </svg>
            </a>
            <a
              href={dayoptBrand.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="GitHub"
            >
              <svg fill="currentColor" viewBox="0 0 24 24" className="size-5">
                <path
                  fillRule="evenodd"
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                  clipRule="evenodd"
                />
              </svg>
            </a>
          </div>
        </div>

        <div className="border-border mx-auto mt-12 grid max-w-3xl grid-cols-1 gap-8 border-t pt-8 sm:grid-cols-3">
          {valueKeys.map((key) => (
            <div key={key} className="text-center">
              <h3 className="text-foreground text-sm font-medium">
                {t(`mission.values.${key}.title`)}
              </h3>
              <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
                {t(`mission.values.${key}.description`)}
              </p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
