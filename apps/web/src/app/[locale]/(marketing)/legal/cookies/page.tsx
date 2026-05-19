import { Link } from '@/platform/i18n/navigation';
import type { Locale } from '@/platform/i18n/routing';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

// ISR: 法的ページは1日ごとに再検証
export const revalidate = 86400;

/**
 * メタデータ生成（SEO対策・i18n対応）
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale?: Locale }>;
}): Promise<Metadata> {
  const { locale = 'ja' } = await params;
  const t = await getTranslations({ locale });

  return {
    title: `${t('legal.cookies.title')} - Dayopt`,
    description: t('legal.cookies.description'),
  };
}

interface PageProps {
  params: Promise<{ locale?: Locale }>;
}

/**
 * Cookieポリシーページ（Server Component）
 */
export default async function CookiePolicyPage({ params }: PageProps) {
  const { locale = 'ja' } = await params;
  const t = await getTranslations({ locale });

  const lastUpdated = '2026-03-23';

  const cookieItems = [
    'supabaseAuth',
    'nextLocale',
    'theme',
    'cookieConsent',
    'vercelAnalytics',
    'recaptcha',
  ] as const;

  return (
    <div className="bg-background container mx-auto min-h-screen max-w-4xl px-4 py-12 md:px-8 md:py-16">
      {/* ヘッダー */}
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-medium">{t('legal.cookies.title')}</h1>
        <p className="text-muted-foreground">{t('legal.cookies.description')}</p>
        <p className="text-muted-foreground mt-2 text-sm">
          {t('legal.lastUpdated')}: {lastUpdated}
        </p>
      </div>

      {/* コンテンツ */}
      <div className="space-y-8">
        {/* 1. はじめに */}
        <section>
          <h2 className="mb-4 text-2xl font-medium">
            {t('legal.cookies.sections.introduction.title')}
          </h2>
          <p className="text-foreground leading-relaxed">
            {t('legal.cookies.sections.introduction.content')}
          </p>
        </section>

        {/* 2. Cookieとは */}
        <section>
          <h2 className="mb-4 text-2xl font-medium">
            {t('legal.cookies.sections.whatAreCookies.title')}
          </h2>
          <p className="text-foreground leading-relaxed">
            {t('legal.cookies.sections.whatAreCookies.content')}
          </p>
        </section>

        {/* 3. Cookieのカテゴリ */}
        <section>
          <h2 className="mb-4 text-2xl font-medium">
            {t('legal.cookies.sections.categories.title')}
          </h2>
          <div className="space-y-6">
            {(['essential', 'analytics', 'preference', 'marketing'] as const).map((category) => (
              <div key={category}>
                <h3 className="text-foreground mb-2 text-lg font-medium">
                  {t(`legal.cookies.sections.categories.${category}.name`)}
                </h3>
                <p className="text-foreground mb-2 leading-relaxed">
                  {t(`legal.cookies.sections.categories.${category}.description`)}
                </p>
                {category === 'marketing' ? (
                  <p className="text-muted-foreground text-sm">
                    {t('legal.cookies.sections.categories.marketing.note')}
                  </p>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    {t(`legal.cookies.sections.categories.${category}.examples`)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* 4. 使用するCookie一覧（表形式） */}
        <section>
          <h2 className="mb-4 text-2xl font-medium">
            {t('legal.cookies.sections.specificCookies.title')}
          </h2>
          <div className="bg-card border-border overflow-hidden rounded-2xl border">
            <table className="w-full">
              <thead>
                <tr className="bg-container border-border border-b">
                  <th className="text-foreground px-6 py-4 text-left text-sm font-medium">
                    {t('legal.cookies.sections.specificCookies.headerName')}
                  </th>
                  <th className="text-foreground px-6 py-4 text-left text-sm font-medium">
                    {t('legal.cookies.sections.specificCookies.headerProvider')}
                  </th>
                  <th className="text-foreground px-6 py-4 text-left text-sm font-medium">
                    {t('legal.cookies.sections.specificCookies.headerPurpose')}
                  </th>
                  <th className="text-foreground px-6 py-4 text-left text-sm font-medium">
                    {t('legal.cookies.sections.specificCookies.headerCategory')}
                  </th>
                  <th className="text-foreground px-6 py-4 text-left text-sm font-medium">
                    {t('legal.cookies.sections.specificCookies.headerDuration')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {cookieItems.map((item) => (
                  <tr key={item}>
                    <td className="text-foreground px-6 py-4 text-sm font-medium">
                      {t(`legal.cookies.sections.specificCookies.${item}.name`)}
                    </td>
                    <td className="text-foreground px-6 py-4 text-sm">
                      {t(`legal.cookies.sections.specificCookies.${item}.provider`)}
                    </td>
                    <td className="text-foreground px-6 py-4 text-sm">
                      {t(`legal.cookies.sections.specificCookies.${item}.purpose`)}
                    </td>
                    <td className="text-foreground px-6 py-4 text-sm">
                      {t(`legal.cookies.sections.specificCookies.${item}.category`)}
                    </td>
                    <td className="text-foreground px-6 py-4 text-sm">
                      {t(`legal.cookies.sections.specificCookies.${item}.duration`)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 5. サードパーティCookie */}
        <section>
          <h2 className="mb-4 text-2xl font-medium">
            {t('legal.cookies.sections.thirdParty.title')}
          </h2>
          <p className="text-foreground mb-4 leading-relaxed">
            {t('legal.cookies.sections.thirdParty.content')}
          </p>
          <ul className="text-foreground list-inside list-disc space-y-2 leading-relaxed">
            <li>{t('legal.cookies.sections.thirdParty.vercel')}</li>
            <li>{t('legal.cookies.sections.thirdParty.sentry')}</li>
            <li>{t('legal.cookies.sections.thirdParty.recaptcha')}</li>
          </ul>
          <p className="text-muted-foreground mt-4 text-sm">
            {t('legal.cookies.sections.thirdParty.note')}
          </p>
        </section>

        {/* 6. Cookieの管理方法 */}
        <section>
          <h2 className="mb-4 text-2xl font-medium">
            {t('legal.cookies.sections.manageCookies.title')}
          </h2>
          <p className="text-foreground mb-4 leading-relaxed">
            {t('legal.cookies.sections.manageCookies.intro')}
          </p>
          <ul className="text-foreground list-inside list-disc space-y-2 leading-relaxed">
            <li>{t('legal.cookies.sections.manageCookies.chrome')}</li>
            <li>{t('legal.cookies.sections.manageCookies.firefox')}</li>
            <li>{t('legal.cookies.sections.manageCookies.safari')}</li>
            <li>{t('legal.cookies.sections.manageCookies.edge')}</li>
          </ul>
        </section>

        {/* 7. Cookie無効化の影響 */}
        <section>
          <h2 className="mb-4 text-2xl font-medium">{t('legal.cookies.sections.impact.title')}</h2>
          <p className="text-foreground leading-relaxed">
            {t('legal.cookies.sections.impact.content')}
          </p>
        </section>

        {/* 8. Do Not Trackシグナル */}
        <section>
          <h2 className="mb-4 text-2xl font-medium">
            {t('legal.cookies.sections.doNotTrack.title')}
          </h2>
          <p className="text-foreground leading-relaxed">
            {t('legal.cookies.sections.doNotTrack.content')}
          </p>
        </section>

        {/* 9. 本ポリシーの変更 */}
        <section>
          <h2 className="mb-4 text-2xl font-medium">{t('legal.cookies.sections.changes.title')}</h2>
          <p className="text-foreground leading-relaxed">
            {t('legal.cookies.sections.changes.content')}
          </p>
        </section>

        {/* 9. お問い合わせ */}
        <section>
          <h2 className="mb-4 text-2xl font-medium">{t('legal.cookies.sections.contact.title')}</h2>
          <p className="text-foreground mb-4 leading-relaxed">
            {t('legal.cookies.sections.contact.content')}
          </p>
          <div className="bg-container rounded-2xl p-4">
            <p className="text-foreground">
              <strong>Email:</strong> {t('legal.contact.email')}
            </p>
            <p className="text-foreground">
              <strong>Website:</strong> {t('legal.contact.website')}
            </p>
          </div>
        </section>

        {/* プライバシーポリシーへのリンク */}
        <section>
          <p className="text-foreground leading-relaxed">
            <Link href="/legal/privacy" className="text-primary underline hover:no-underline">
              {t('legal.navigation.privacy')}
            </Link>
          </p>
        </section>
      </div>

      {/* 法的レビュー警告（開発環境のみ表示） */}
      {process.env.NODE_ENV === 'development' && (
        <div className="bg-muted border-destructive mt-12 rounded-2xl border-2 p-6">
          <div className="flex items-start gap-4">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="text-destructive font-medium">{t('legal.reviewWarning.title')}</p>
              <p className="text-muted-foreground mt-1 text-sm">
                {t('legal.reviewWarning.description')}
              </p>
              <ul className="text-muted-foreground mt-2 list-inside list-disc text-sm">
                <li>{t('legal.reviewWarning.items.lawyer')}</li>
                <li>{t('legal.reviewWarning.items.update')}</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
