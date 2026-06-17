import { dayoptContact } from '@dayopt/config';
import { AlertTriangle, ExternalLink, FileText, Lock, Mail, Shield } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

export async function SecurityContent() {
  const t = await getTranslations('legal');

  return (
    <div className="bg-background container mx-auto min-h-screen max-w-4xl px-4 py-12 md:px-8 md:py-16">
      {/* ページヘッダー */}
      <div className="mb-8">
        <div className="mb-4 flex items-center gap-4">
          <Shield className="text-primary size-10" />
          <h1 className="text-3xl font-medium">{t('security.header.title')}</h1>
        </div>
        <p className="text-muted-foreground">{t('security.header.description')}</p>
      </div>

      {/* セキュリティポリシー */}
      <section className="mb-12">
        <div className="mb-4 flex items-center gap-2">
          <Lock className="text-primary size-6" />
          <h2 className="text-2xl font-medium">{t('security.policy.title')}</h2>
        </div>

        <div className="bg-container mb-6 rounded-2xl p-6">
          <h3 className="mb-4 text-lg font-medium">
            {t('security.policy.supportedVersions.title')}
          </h3>
          <table className="border-border w-full border">
            <thead className="bg-container">
              <tr>
                <th className="border-border border p-4 text-left">
                  {t('security.policy.supportedVersions.version')}
                </th>
                <th className="border-border border p-4 text-left">
                  {t('security.policy.supportedVersions.status')}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border-border border p-4">
                  {t('security.policy.supportedVersions.v1')}
                </td>
                <td className="border-border border p-4">
                  {t('security.policy.supportedVersions.v1Status')}
                </td>
              </tr>
              <tr>
                <td className="border-border border p-4">
                  {t('security.policy.supportedVersions.v0')}
                </td>
                <td className="border-border border p-4">
                  {t('security.policy.supportedVersions.v0Status')}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="prose dark:prose-invert max-w-none">
          <h3 className="text-lg font-medium">{t('security.policy.measures.title')}</h3>
          <ul className="space-y-2">
            <li>{t('security.policy.measures.https')}</li>
            <li>{t('security.policy.measures.mfa')}</li>
            <li>{t('security.policy.measures.rateLimit')}</li>
            <li>{t('security.policy.measures.sqlInjection')}</li>
            <li>{t('security.policy.measures.xss')}</li>
            <li>{t('security.policy.measures.csrf')}</li>
            <li>{t('security.policy.measures.dependencies')}</li>
            <li>{t('security.policy.measures.monitoring')}</li>
          </ul>
        </div>
      </section>

      {/* 脆弱性報告 */}
      <section className="mb-12">
        <div className="mb-4 flex items-center gap-2">
          <AlertTriangle className="text-primary size-6" />
          <h2 className="text-2xl font-medium">{t('security.vulnerability.title')}</h2>
        </div>

        <div className="bg-muted mb-6 rounded-2xl p-6">
          <p className="text-destructive-foreground mb-4 font-medium">
            {t('security.vulnerability.warning.title')}
          </p>
          <p className="text-muted-foreground text-sm">
            {t('security.vulnerability.warning.description')}
          </p>
        </div>

        <div className="prose dark:prose-invert max-w-none">
          <h3 className="text-lg font-medium">{t('security.vulnerability.contacts.title')}</h3>
          <ul className="space-y-2">
            <li className="flex items-center gap-2">
              <Mail className="size-4" />
              <strong>{t('security.vulnerability.contacts.email')}</strong>:{' '}
              <a
                href={`mailto:${dayoptContact.securityEmail}`}
                className="text-primary hover:underline"
              >
                {t('security.vulnerability.contacts.emailAddress')}
              </a>
            </li>
            <li className="flex items-center gap-2">
              <ExternalLink className="size-4" />
              <strong>{t('security.vulnerability.contacts.github')}</strong>:{' '}
              <a
                href="https://github.com/Dayopt/dayopt/security/advisories/new"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {t('security.vulnerability.contacts.githubLink')}
              </a>
            </li>
          </ul>

          <h3 className="mt-6 text-lg font-medium">
            {t('security.vulnerability.includeInfo.title')}
          </h3>
          <ul className="space-y-2">
            <li>{t('security.vulnerability.includeInfo.type')}</li>
            <li>{t('security.vulnerability.includeInfo.affectedVersions')}</li>
            <li>{t('security.vulnerability.includeInfo.steps')}</li>
            <li>{t('security.vulnerability.includeInfo.poc')}</li>
            <li>{t('security.vulnerability.includeInfo.impact')}</li>
            <li>{t('security.vulnerability.includeInfo.fix')}</li>
          </ul>

          <h3 className="mt-6 text-lg font-medium">{t('security.vulnerability.timeline.title')}</h3>
          <table className="border-border w-full border">
            <thead className="bg-container">
              <tr>
                <th className="border-border border p-4 text-left">
                  {t('security.vulnerability.timeline.severity')}
                </th>
                <th className="border-border border p-4 text-left">
                  {t('security.vulnerability.timeline.initialResponse')}
                </th>
                <th className="border-border border p-4 text-left">
                  {t('security.vulnerability.timeline.fixRelease')}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border-border border p-4">
                  {t('security.vulnerability.timeline.critical')}
                </td>
                <td className="border-border border p-4">
                  {t('security.vulnerability.timeline.criticalResponse')}
                </td>
                <td className="border-border border p-4">
                  {t('security.vulnerability.timeline.criticalFix')}
                </td>
              </tr>
              <tr>
                <td className="border-border border p-4">
                  {t('security.vulnerability.timeline.high')}
                </td>
                <td className="border-border border p-4">
                  {t('security.vulnerability.timeline.highResponse')}
                </td>
                <td className="border-border border p-4">
                  {t('security.vulnerability.timeline.highFix')}
                </td>
              </tr>
              <tr>
                <td className="border-border border p-4">
                  {t('security.vulnerability.timeline.medium')}
                </td>
                <td className="border-border border p-4">
                  {t('security.vulnerability.timeline.mediumResponse')}
                </td>
                <td className="border-border border p-4">
                  {t('security.vulnerability.timeline.mediumFix')}
                </td>
              </tr>
              <tr>
                <td className="border-border border p-4">
                  {t('security.vulnerability.timeline.low')}
                </td>
                <td className="border-border border p-4">
                  {t('security.vulnerability.timeline.lowResponse')}
                </td>
                <td className="border-border border p-4">
                  {t('security.vulnerability.timeline.lowFix')}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* 責任ある開示 */}
      <section className="mb-12">
        <h2 className="mb-4 text-2xl font-medium">{t('security.disclosure.title')}</h2>

        <div className="bg-container rounded-2xl p-6">
          <h3 className="mb-4 text-lg font-medium">{t('security.disclosure.safeHarbor.title')}</h3>
          <p className="text-foreground mb-4 leading-relaxed">
            {t('security.disclosure.safeHarbor.description')}
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h4 className="text-success mb-2 font-medium">
                {t('security.disclosure.safeHarbor.allowed.title')}
              </h4>
              <ul className="text-muted-foreground space-y-1 text-sm">
                <li>{t('security.disclosure.safeHarbor.allowed.ownAccount')}</li>
                <li>{t('security.disclosure.safeHarbor.allowed.research')}</li>
                <li>{t('security.disclosure.safeHarbor.allowed.poc')}</li>
              </ul>
            </div>
            <div>
              <h4 className="text-destructive mb-2 font-medium">
                {t('security.disclosure.safeHarbor.prohibited.title')}
              </h4>
              <ul className="text-muted-foreground space-y-1 text-sm">
                <li>{t('security.disclosure.safeHarbor.prohibited.dos')}</li>
                <li>{t('security.disclosure.safeHarbor.prohibited.dataAccess')}</li>
                <li>{t('security.disclosure.safeHarbor.prohibited.disclosure')}</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* 関連ドキュメント */}
      <section className="mb-12">
        <div className="mb-4 flex items-center gap-2">
          <FileText className="text-primary size-6" />
          <h2 className="text-2xl font-medium">{t('security.relatedDocs.title')}</h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Link
            href="https://github.com/Dayopt/dayopt/blob/main/docs/legal/SECURITY.md"
            target="_blank"
            rel="noopener noreferrer"
            className="border-border hover:border-primary block rounded-2xl border p-4 transition-colors"
          >
            <h3 className="mb-2 font-medium">{t('security.relatedDocs.securityPolicy.title')}</h3>
            <p className="text-muted-foreground text-sm">
              {t('security.relatedDocs.securityPolicy.description')}
            </p>
          </Link>

          <Link
            href="https://github.com/Dayopt/dayopt/blob/main/docs/legal/VULNERABILITY_DISCLOSURE.md"
            target="_blank"
            rel="noopener noreferrer"
            className="border-border hover:border-primary block rounded-2xl border p-4 transition-colors"
          >
            <h3 className="mb-2 font-medium">
              {t('security.relatedDocs.vulnerabilityDisclosure.title')}
            </h3>
            <p className="text-muted-foreground text-sm">
              {t('security.relatedDocs.vulnerabilityDisclosure.description')}
            </p>
          </Link>

          <Link
            href="https://github.com/Dayopt/dayopt/blob/main/docs/legal/INCIDENT_RESPONSE.md"
            target="_blank"
            rel="noopener noreferrer"
            className="border-border hover:border-primary block rounded-2xl border p-4 transition-colors"
          >
            <h3 className="mb-2 font-medium">{t('security.relatedDocs.incidentResponse.title')}</h3>
            <p className="text-muted-foreground text-sm">
              {t('security.relatedDocs.incidentResponse.description')}
            </p>
          </Link>

          <Link
            href="/legal/privacy"
            className="border-border hover:border-primary block rounded-2xl border p-4 transition-colors"
          >
            <h3 className="mb-2 font-medium">{t('security.relatedDocs.privacyPolicy.title')}</h3>
            <p className="text-muted-foreground text-sm">
              {t('security.relatedDocs.privacyPolicy.description')}
            </p>
          </Link>
        </div>
      </section>

      {/* お問い合わせ */}
      <section className="bg-container rounded-2xl p-6">
        <h2 className="mb-4 text-xl font-medium">{t('security.contact.title')}</h2>
        <div className="space-y-2">
          <p className="flex items-center gap-2">
            <Mail className="size-4" />
            <strong>{t('security.contact.securityTeam')}</strong>:{' '}
            <a
              href={`mailto:${dayoptContact.securityEmail}`}
              className="text-primary hover:underline"
            >
              {t('security.contact.securityEmail')}
            </a>
          </p>
          <p className="flex items-center gap-2">
            <Mail className="size-4" />
            <strong>{t('security.contact.general')}</strong>:{' '}
            <a
              href={`mailto:${dayoptContact.supportEmail}`}
              className="text-primary hover:underline"
            >
              {t('security.contact.generalEmail')}
            </a>
          </p>
        </div>

        <p className="text-muted-foreground mt-4 text-sm">{t('security.contact.thankYou')}</p>
      </section>

      {/* 最終更新日 */}
      <div className="text-muted-foreground mt-8 text-center text-sm">
        <p>{t('security.lastUpdated')}</p>
      </div>
    </div>
  );
}
