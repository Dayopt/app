import { Button } from '@/components/ui/button';
import { Container } from '@/components/ui/container';
import { getTranslations } from 'next-intl/server';

import { HeroProductMocks } from './HeroProductMocks';

interface HeroSectionProps {
  locale: string;
}

export async function HeroSection({ locale }: HeroSectionProps) {
  const t = await getTranslations({ locale, namespace: 'marketing' });

  const words = t.raw('hero.headline.words') as string[];
  const highlightIndex = t.raw('hero.headline.highlightIndex') as number;

  return (
    <section className="from-background via-background to-container/30 bg-gradient-to-b py-16 sm:py-24 lg:py-32 lg:pb-40">
      <Container>
        <div className="relative mx-auto max-w-4xl text-center">
          {/* Ambient glow */}
          <div className="hero-ambient-glow" />

          {/* Headline — staggered per word */}
          <h1 className="text-6xl leading-[1.1] font-medium tracking-[-0.04em]">
            {words.map((word, i) => (
              <span
                key={i}
                className={`hero-animate hero-delay-${i + 1} inline-block ${
                  i === highlightIndex ? 'text-primary' : 'text-foreground'
                } ${i > 0 ? 'ml-[0.3em]' : ''}`}
              >
                {word}
              </span>
            ))}
          </h1>

          {/* Subcopy */}
          <p className="hero-animate hero-delay-4 text-muted-foreground mx-auto mt-6 max-w-3xl text-lg sm:text-xl">
            {t('hero.subcopy')}
          </p>

          {/* CTA */}
          <div className="hero-animate hero-delay-5 mt-12 flex items-center justify-center">
            <Button variant="primary" size="lg" asChild>
              <a
                href="https://app.dayopt.com/signup"
                className="hero-cta-glow hero-cta-attention"
                rel="noopener noreferrer"
              >
                {t('hero.ctaPrimary')}
              </a>
            </Button>
          </div>

          {/* Annotation */}
          <p className="hero-animate hero-delay-6 text-muted-foreground mt-4 text-sm">
            {t('hero.ctaNote')}
          </p>
        </div>

        {/* Visual bridge — gradient line */}
        <div className="hero-animate hero-delay-7 from-background to-border/50 pointer-events-none mx-auto mt-8 h-10 w-px bg-gradient-to-b" />

        {/* Product mocks carousel */}
        <div className="hero-animate hero-delay-7 mt-6 sm:mt-8">
          <HeroProductMocks
            labels={{
              plan: t('hero.mocks.plan'),
              track: t('hero.mocks.track'),
              learn: t('hero.mocks.learn'),
            }}
          />
        </div>
      </Container>
    </section>
  );
}
