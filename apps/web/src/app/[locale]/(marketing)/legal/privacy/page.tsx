import { Link } from '@dayopt/i18n/navigation';
import type { Locale } from '@dayopt/i18n/routing';
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
    title: `${t('legal.privacy.title')} - Dayopt`,
    description: t('legal.privacy.description'),
  };
}

interface PageProps {
  params: Promise<{ locale?: Locale }>;
}

/**
 * プライバシーポリシーページ（Server Component）
 */
export default async function PrivacyPolicyPage({ params }: PageProps) {
  // i18n翻訳取得（URLからロケール取得、デフォルトはja）
  const { locale = 'ja' } = await params;
  const t = await getTranslations({ locale });

  // 最終更新日（実際のプロジェクトでは、CMSや設定ファイルから取得）
  const lastUpdated = '2026-07-21';

  return (
    <div className="bg-background container mx-auto min-h-screen max-w-4xl px-4 py-12 md:px-8 md:py-16">
      {/* ヘッダー */}
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-medium">{t('legal.privacy.title')}</h1>
        <p className="text-muted-foreground">{t('legal.privacy.description')}</p>
        <p className="text-muted-foreground mt-2 text-sm">
          {t('legal.lastUpdated')}: {lastUpdated}
        </p>
      </div>

      {/* コンテンツ */}
      <div className="space-y-8">
        {/* 1. はじめに */}
        <section>
          <h2 className="mb-4 text-2xl font-medium">
            {t('legal.privacy.sections.introduction.title')}
          </h2>
          <p className="text-foreground leading-relaxed">
            {t('legal.privacy.sections.introduction.content')}
          </p>
        </section>

        {/* 2. 収集する情報 */}
        <section>
          <h2 className="mb-4 text-2xl font-medium">
            {t('legal.privacy.sections.dataCollection.title')}
          </h2>
          <ul className="text-foreground list-inside list-disc space-y-2 leading-relaxed">
            <li>{t('legal.privacy.sections.dataCollection.accountInfo')}</li>
            <li>{t('legal.privacy.sections.dataCollection.usageData')}</li>
            <li>{t('legal.privacy.sections.dataCollection.contactData')}</li>
            <li>{t('legal.privacy.sections.dataCollection.technicalData')}</li>
            <li>{t('legal.privacy.sections.dataCollection.cookies')}</li>
          </ul>
        </section>

        {/* 3. 情報の利用目的 */}
        <section>
          <h2 className="mb-4 text-2xl font-medium">
            {t('legal.privacy.sections.dataUsage.title')}
          </h2>
          <ul className="text-foreground list-inside list-disc space-y-2 leading-relaxed">
            <li>{t('legal.privacy.sections.dataUsage.serviceProvision')}</li>
            <li>{t('legal.privacy.sections.dataUsage.userSupport')}</li>
            <li>{t('legal.privacy.sections.dataUsage.security')}</li>
            <li>{t('legal.privacy.sections.dataUsage.analytics')}</li>
            <li>{t('legal.privacy.sections.dataUsage.communication')}</li>
          </ul>
        </section>

        {/* 4. 第三者提供 */}
        <section>
          <h2 className="mb-4 text-2xl font-medium">
            {t('legal.privacy.sections.dataSharing.title')}
          </h2>
          <p className="text-foreground mb-4 leading-relaxed">
            {t('legal.privacy.sections.dataSharing.intro')}
          </p>
          <ul className="text-foreground list-inside list-disc space-y-2 leading-relaxed">
            <li>{t('legal.privacy.sections.dataSharing.supabase')}</li>
            <li>{t('legal.privacy.sections.dataSharing.vercel')}</li>
            <li>{t('legal.privacy.sections.dataSharing.sentry')}</li>
            <li>{t('legal.privacy.sections.dataSharing.resend')}</li>
            <li>{t('legal.privacy.sections.dataSharing.cloudflareEmail')}</li>
            <li>{t('legal.privacy.sections.dataSharing.google')}</li>
            <li>{t('legal.privacy.sections.dataSharing.cloudflare')}</li>
          </ul>
          <p className="text-muted-foreground mt-4 text-sm">
            {t('legal.privacy.sections.dataSharing.note')}
          </p>
        </section>

        {/* 5. データの所有権 */}
        <section>
          <h2 className="mb-4 text-2xl font-medium">
            {t('legal.privacy.sections.dataOwnership.title')}
          </h2>
          <p className="text-foreground mb-4 leading-relaxed">
            {t('legal.privacy.sections.dataOwnership.content')}
          </p>
          <ul className="text-foreground list-inside list-disc space-y-2 leading-relaxed">
            <li>{t('legal.privacy.sections.dataOwnership.export')}</li>
            <li>{t('legal.privacy.sections.dataOwnership.termination')}</li>
          </ul>
        </section>

        {/* 6. サブプロセッサー */}
        <section>
          <h2 className="mb-4 text-2xl font-medium">
            {t('legal.privacy.sections.subProcessors.title')}
          </h2>
          <p className="text-foreground mb-4 leading-relaxed">
            {t('legal.privacy.sections.subProcessors.intro')}
          </p>
          <ul className="text-foreground list-inside list-disc space-y-2 leading-relaxed">
            <li>{t('legal.privacy.sections.subProcessors.supabase')}</li>
            <li>{t('legal.privacy.sections.subProcessors.vercel')}</li>
            <li>{t('legal.privacy.sections.subProcessors.sentry')}</li>
            <li>{t('legal.privacy.sections.subProcessors.stripe')}</li>
            <li>{t('legal.privacy.sections.subProcessors.anthropic')}</li>
            <li>{t('legal.privacy.sections.subProcessors.openai')}</li>
            <li>{t('legal.privacy.sections.subProcessors.resend')}</li>
            <li>{t('legal.privacy.sections.subProcessors.upstash')}</li>
            <li>{t('legal.privacy.sections.subProcessors.cloudflareEmail')}</li>
            <li>{t('legal.privacy.sections.subProcessors.google')}</li>
            <li>{t('legal.privacy.sections.subProcessors.cloudflare')}</li>
          </ul>
          <p className="text-muted-foreground mt-4 text-sm">
            {t('legal.privacy.sections.subProcessors.changes')}
          </p>
        </section>

        {/* 7. 国際データ移転 */}
        <section>
          <h2 className="mb-4 text-2xl font-medium">
            {t('legal.privacy.sections.internationalTransfers.title')}
          </h2>
          <p className="text-foreground mb-4 leading-relaxed">
            {t('legal.privacy.sections.internationalTransfers.content')}
          </p>
          <ul className="text-foreground list-inside list-disc space-y-2 leading-relaxed">
            <li>{t('legal.privacy.sections.internationalTransfers.location')}</li>
            <li>{t('legal.privacy.sections.internationalTransfers.safeguards')}</li>
            <li>{t('legal.privacy.sections.internationalTransfers.japan')}</li>
          </ul>
        </section>

        {/* 8. 処理の法的根拠 */}
        <section>
          <h2 className="mb-4 text-2xl font-medium">
            {t('legal.privacy.sections.legalBasis.title')}
          </h2>
          <p className="text-foreground mb-4 leading-relaxed">
            {t('legal.privacy.sections.legalBasis.intro')}
          </p>
          <ul className="text-foreground list-inside list-disc space-y-2 leading-relaxed">
            <li>{t('legal.privacy.sections.legalBasis.contract')}</li>
            <li>{t('legal.privacy.sections.legalBasis.consent')}</li>
            <li>{t('legal.privacy.sections.legalBasis.legitimate')}</li>
            <li>{t('legal.privacy.sections.legalBasis.legal')}</li>
          </ul>
        </section>

        {/* 9. データ処理の詳細 */}
        <section>
          <h2 className="mb-4 text-2xl font-medium">
            {t('legal.privacy.sections.dataProcessing.title')}
          </h2>
          <p className="text-foreground mb-4 leading-relaxed">
            {t('legal.privacy.sections.dataProcessing.intro')}
          </p>
          <ul className="text-foreground list-inside list-disc space-y-2 leading-relaxed">
            <li>{t('legal.privacy.sections.dataProcessing.accountData')}</li>
            <li>{t('legal.privacy.sections.dataProcessing.usageData')}</li>
            <li>{t('legal.privacy.sections.dataProcessing.technicalData')}</li>
          </ul>
          <p className="text-foreground mt-4 leading-relaxed">
            {t('legal.privacy.sections.dataProcessing.automated')}
          </p>
          <p className="text-foreground mt-4 leading-relaxed">
            {t('legal.privacy.sections.dataProcessing.exportInfo')}
          </p>
        </section>

        {/* 10. AI機能 */}
        <section>
          <h2 className="mb-4 text-2xl font-medium">
            {t('legal.privacy.sections.aiFeatures.title')}
          </h2>
          <p className="text-foreground mb-4 leading-relaxed">
            {t('legal.privacy.sections.aiFeatures.intro')}
          </p>
          <ul className="text-foreground list-inside list-disc space-y-2 leading-relaxed">
            <li>{t('legal.privacy.sections.aiFeatures.whatIsSent')}</li>
            <li>{t('legal.privacy.sections.aiFeatures.noTraining')}</li>
            <li>{t('legal.privacy.sections.aiFeatures.byok')}</li>
            <li>{t('legal.privacy.sections.aiFeatures.limitations')}</li>
            <li>{t('legal.privacy.sections.aiFeatures.optOut')}</li>
          </ul>
        </section>

        {/* 11. データ保持期間 */}
        <section>
          <h2 className="mb-4 text-2xl font-medium">
            {t('legal.privacy.sections.dataRetention.title')}
          </h2>
          <ul className="text-foreground list-inside list-disc space-y-2 leading-relaxed">
            <li>{t('legal.privacy.sections.dataRetention.active')}</li>
            <li>{t('legal.privacy.sections.dataRetention.deleted')}</li>
            <li>{t('legal.privacy.sections.dataRetention.contact')}</li>
            <li>{t('legal.privacy.sections.dataRetention.legal')}</li>
          </ul>
        </section>

        {/* 6. ユーザーの権利 */}
        <section>
          <h2 className="mb-4 text-2xl font-medium">
            {t('legal.privacy.sections.userRights.title')}
          </h2>
          <ul className="text-foreground list-inside list-disc space-y-2 leading-relaxed">
            <li>{t('legal.privacy.sections.userRights.access')}</li>
            <li>{t('legal.privacy.sections.userRights.correction')}</li>
            <li>{t('legal.privacy.sections.userRights.deletion')}</li>
            <li>{t('legal.privacy.sections.userRights.portability')}</li>
            <li>{t('legal.privacy.sections.userRights.objection')}</li>
            <li>{t('legal.privacy.sections.userRights.complaint')}</li>
          </ul>
          <p className="text-muted-foreground mt-4 text-sm">
            {t('legal.privacy.sections.userRights.contact')}
          </p>
        </section>

        {/* 7. セキュリティ対策 */}
        <section>
          <h2 className="mb-4 text-2xl font-medium">
            {t('legal.privacy.sections.security.title')}
          </h2>
          <p className="text-foreground mb-4 leading-relaxed">
            {t('legal.privacy.sections.security.measures')}
          </p>
          <ul className="text-foreground list-inside list-disc space-y-2 leading-relaxed">
            <li>{t('legal.privacy.sections.security.encryption')}</li>
            <li>{t('legal.privacy.sections.security.access')}</li>
            <li>{t('legal.privacy.sections.security.monitoring')}</li>
          </ul>
        </section>

        {/* 8. Cookieについて */}
        <section>
          <h2 className="mb-4 text-2xl font-medium">{t('legal.privacy.sections.cookies.title')}</h2>
          <p className="text-foreground mb-4 leading-relaxed">
            {t('legal.privacy.sections.cookies.intro')}
          </p>
          <ul className="text-foreground list-inside list-disc space-y-2 leading-relaxed">
            <li>{t('legal.privacy.sections.cookies.essential')}</li>
            <li>{t('legal.privacy.sections.cookies.analytics')}</li>
            <li>{t('legal.privacy.sections.cookies.preference')}</li>
          </ul>
          <p className="text-muted-foreground mt-4 text-sm">
            {t('legal.privacy.sections.cookies.control')}
          </p>
          <p className="text-foreground mt-4 leading-relaxed">
            <Link href="/legal/cookies" className="text-primary underline hover:no-underline">
              {t('legal.privacy.sections.cookies.policyLink')}
            </Link>
          </p>
        </section>

        {/* 14. データ侵害時の通知 */}
        <section>
          <h2 className="mb-4 text-2xl font-medium">
            {t('legal.privacy.sections.dataBreach.title')}
          </h2>
          <p className="text-foreground mb-4 leading-relaxed">
            {t('legal.privacy.sections.dataBreach.content')}
          </p>
          <ul className="text-foreground list-inside list-disc space-y-2 leading-relaxed">
            <li>{t('legal.privacy.sections.dataBreach.notify')}</li>
            <li>{t('legal.privacy.sections.dataBreach.inform')}</li>
            <li>{t('legal.privacy.sections.dataBreach.document')}</li>
            <li>{t('legal.privacy.sections.dataBreach.measures')}</li>
          </ul>
        </section>

        {/* 15. カリフォルニア州のプライバシー権 */}
        <section>
          <h2 className="mb-4 text-2xl font-medium">{t('legal.privacy.sections.ccpa.title')}</h2>
          <p className="text-foreground mb-4 leading-relaxed">
            {t('legal.privacy.sections.ccpa.intro')}
          </p>
          <ul className="text-foreground list-inside list-disc space-y-2 leading-relaxed">
            <li>{t('legal.privacy.sections.ccpa.know')}</li>
            <li>{t('legal.privacy.sections.ccpa.delete')}</li>
            <li>{t('legal.privacy.sections.ccpa.noSell')}</li>
            <li>{t('legal.privacy.sections.ccpa.nondiscrimination')}</li>
            <li>{t('legal.privacy.sections.ccpa.categories')}</li>
          </ul>
          <p className="text-muted-foreground mt-4 text-sm">
            {t('legal.privacy.sections.ccpa.contact')}
          </p>
        </section>

        {/* 16. 未成年者について */}
        <section>
          <h2 className="mb-4 text-2xl font-medium">
            {t('legal.privacy.sections.children.title')}
          </h2>
          <p className="text-foreground leading-relaxed">
            {t('legal.privacy.sections.children.content')}
          </p>
        </section>

        {/* 10. ポリシーの変更 */}
        <section>
          <h2 className="mb-4 text-2xl font-medium">{t('legal.privacy.sections.changes.title')}</h2>
          <p className="text-foreground leading-relaxed">
            {t('legal.privacy.sections.changes.content')}
          </p>
        </section>

        {/* 11. お問い合わせ */}
        <section>
          <h2 className="mb-4 text-2xl font-medium">{t('legal.privacy.sections.contact.title')}</h2>
          <p className="text-foreground mb-4 leading-relaxed">
            {t('legal.privacy.sections.contact.content')}
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
