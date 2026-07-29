/**
 * Home（トップ LP）ページの Storybook Story。
 *
 * 個別セクションではなく、セクションを並べた「ページ全体の流れ」を確認するための Page story。
 * 構成は実ページ apps/web/src/app/[locale]/(marketing)/page.tsx に合わせる（Hero → Problem → How → Open by design → Pricing）。
 */
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { HeroSection } from './components/HeroSection';
import { HowSection } from './components/HowSection';
import { OpenByDesignSection } from './components/OpenByDesignSection';
import { PricingSection } from './components/PricingSection';
import { ProblemSection } from './components/ProblemSection';

const meta = {
  title: 'Web/Pages/Home',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj;

function HomeComposition({ locale }: { locale: string }) {
  return (
    <div className="bg-background">
      <div className="relative isolate">
        <HeroSection locale={locale} />
        <ProblemSection locale={locale} />
        <HowSection locale={locale} />
        <OpenByDesignSection locale={locale} />
        <PricingSection locale={locale} />
      </div>
    </div>
  );
}

/** 日本語ロケールのトップページ構成。 */
export const Ja: Story = {
  render: () => <HomeComposition locale="ja" />,
};

/** 英語ロケールのトップページ構成。 */
export const En: Story = {
  render: () => <HomeComposition locale="en" />,
};

/** 全ロケール一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col gap-12">
      <HomeComposition locale="ja" />
      <HomeComposition locale="en" />
    </div>
  ),
};
