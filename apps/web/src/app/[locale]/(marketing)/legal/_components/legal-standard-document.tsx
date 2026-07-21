import { dayoptContact, dayoptUrls } from '@dayopt/config';
import { Link } from '@dayopt/i18n/navigation';

import { readLegalText, readLegalTree, type LegalContentTree } from './legal-content-tree';

type StandardDocumentKind = 'privacy' | 'terms';

type SectionBlock =
  | { type: 'paragraph'; key: string; position?: 'before' | 'after' }
  | { type: 'list'; keys: readonly string[] }
  | { type: 'note'; key: string }
  | { type: 'support-contact'; prefixKey: string; suffixKey: string }
  | { type: 'link'; labelKey: string; href?: string; hrefKey?: string }
  | { type: 'contact' };

interface SectionLayout {
  key: string;
  blocks: readonly SectionBlock[];
}

function getParagraphClassName(position: 'before' | 'after' | undefined): string {
  if (position === 'before') {
    return 'text-foreground mb-4 leading-relaxed';
  }
  if (position === 'after') {
    return 'text-foreground mt-4 leading-relaxed';
  }
  return 'text-foreground leading-relaxed';
}

const PRIVACY_SECTIONS: readonly SectionLayout[] = [
  { key: 'introduction', blocks: [{ type: 'paragraph', key: 'content' }] },
  {
    key: 'dataCollection',
    blocks: [
      {
        type: 'list',
        keys: ['accountInfo', 'usageData', 'contactData', 'technicalData', 'cookies'],
      },
    ],
  },
  {
    key: 'dataUsage',
    blocks: [
      {
        type: 'list',
        keys: ['serviceProvision', 'userSupport', 'security', 'analytics', 'communication'],
      },
    ],
  },
  {
    key: 'dataSharing',
    blocks: [
      { type: 'paragraph', key: 'intro', position: 'before' },
      {
        type: 'list',
        keys: ['supabase', 'vercel', 'sentry', 'resend', 'cloudflareEmail', 'google', 'cloudflare'],
      },
      { type: 'note', key: 'note' },
    ],
  },
  {
    key: 'dataOwnership',
    blocks: [
      { type: 'paragraph', key: 'content', position: 'before' },
      { type: 'list', keys: ['export', 'termination'] },
    ],
  },
  {
    key: 'subProcessors',
    blocks: [
      { type: 'paragraph', key: 'intro', position: 'before' },
      {
        type: 'list',
        keys: [
          'supabase',
          'vercel',
          'sentry',
          'stripe',
          'anthropic',
          'openai',
          'resend',
          'upstash',
          'cloudflareEmail',
          'google',
          'cloudflare',
        ],
      },
      { type: 'note', key: 'changes' },
    ],
  },
  {
    key: 'internationalTransfers',
    blocks: [
      { type: 'paragraph', key: 'content', position: 'before' },
      { type: 'list', keys: ['location', 'safeguards', 'japan'] },
    ],
  },
  {
    key: 'legalBasis',
    blocks: [
      { type: 'paragraph', key: 'intro', position: 'before' },
      { type: 'list', keys: ['contract', 'consent', 'legitimate', 'legal'] },
    ],
  },
  {
    key: 'dataProcessing',
    blocks: [
      { type: 'paragraph', key: 'intro', position: 'before' },
      { type: 'list', keys: ['accountData', 'usageData', 'technicalData'] },
      { type: 'paragraph', key: 'automated', position: 'after' },
      { type: 'paragraph', key: 'exportInfo', position: 'after' },
    ],
  },
  {
    key: 'aiFeatures',
    blocks: [
      { type: 'paragraph', key: 'intro', position: 'before' },
      {
        type: 'list',
        keys: ['whatIsSent', 'noTraining', 'byok', 'limitations', 'optOut'],
      },
    ],
  },
  {
    key: 'dataRetention',
    blocks: [{ type: 'list', keys: ['active', 'deleted', 'contact', 'legal'] }],
  },
  {
    key: 'userRights',
    blocks: [
      {
        type: 'list',
        keys: ['access', 'correction', 'deletion', 'portability', 'objection', 'complaint'],
      },
      { type: 'note', key: 'contact' },
    ],
  },
  {
    key: 'security',
    blocks: [
      { type: 'paragraph', key: 'measures', position: 'before' },
      { type: 'list', keys: ['encryption', 'access', 'monitoring'] },
    ],
  },
  {
    key: 'cookies',
    blocks: [
      { type: 'paragraph', key: 'intro', position: 'before' },
      { type: 'list', keys: ['essential', 'analytics', 'preference'] },
      { type: 'note', key: 'control' },
      { type: 'link', labelKey: 'policyLink', href: '/legal/cookies' },
    ],
  },
  {
    key: 'dataBreach',
    blocks: [
      { type: 'paragraph', key: 'content', position: 'before' },
      { type: 'list', keys: ['notify', 'inform', 'document', 'measures'] },
    ],
  },
  {
    key: 'ccpa',
    blocks: [
      { type: 'paragraph', key: 'intro', position: 'before' },
      { type: 'list', keys: ['know', 'delete', 'noSell', 'nondiscrimination', 'categories'] },
      { type: 'support-contact', prefixKey: 'contactPrefix', suffixKey: 'contactSuffix' },
    ],
  },
  { key: 'children', blocks: [{ type: 'paragraph', key: 'content' }] },
  { key: 'changes', blocks: [{ type: 'paragraph', key: 'content' }] },
  {
    key: 'contact',
    blocks: [{ type: 'paragraph', key: 'content', position: 'before' }, { type: 'contact' }],
  },
];

const TERMS_SECTIONS: readonly SectionLayout[] = [
  { key: 'introduction', blocks: [{ type: 'paragraph', key: 'content' }] },
  { key: 'serviceDescription', blocks: [{ type: 'paragraph', key: 'content' }] },
  {
    key: 'accountRegistration',
    blocks: [{ type: 'list', keys: ['requirements', 'responsibility', 'security', 'age'] }],
  },
  {
    key: 'userResponsibilities',
    blocks: [
      { type: 'paragraph', key: 'intro', position: 'before' },
      {
        type: 'list',
        keys: ['illegal', 'harmful', 'unauthorized', 'impersonation', 'spam', 'content'],
      },
    ],
  },
  {
    key: 'intellectualProperty',
    blocks: [{ type: 'list', keys: ['ownership', 'userContent', 'license'] }],
  },
  {
    key: 'aiTerms',
    blocks: [
      { type: 'paragraph', key: 'intro', position: 'before' },
      {
        type: 'list',
        keys: ['providers', 'noTraining', 'byok', 'accuracy', 'limits', 'liability'],
      },
    ],
  },
  {
    key: 'subscriptionPlans',
    blocks: [
      { type: 'paragraph', key: 'intro', position: 'before' },
      { type: 'list', keys: ['free', 'pro', 'changes', 'downgrade'] },
    ],
  },
  {
    key: 'dataOwnership',
    blocks: [{ type: 'list', keys: ['ownership', 'license', 'export', 'termination'] }],
  },
  {
    key: 'acceptableUse',
    blocks: [
      { type: 'paragraph', key: 'intro', position: 'before' },
      { type: 'list', keys: ['automation', 'reverse', 'abuse', 'resale', 'security'] },
    ],
  },
  {
    key: 'serviceLevel',
    blocks: [{ type: 'list', keys: ['target', 'maintenance', 'status', 'credits'] }],
  },
  {
    key: 'limitationOfLiability',
    blocks: [{ type: 'list', keys: ['cap', 'indirect', 'forceMajeure', 'exceptions'] }],
  },
  {
    key: 'indemnification',
    blocks: [
      { type: 'paragraph', key: 'obligation', position: 'before' },
      { type: 'list', keys: ['violations', 'thirdParty', 'misuse'] },
      { type: 'note', key: 'notification' },
    ],
  },
  { key: 'dataBackup', blocks: [{ type: 'list', keys: ['responsibility', 'liability'] }] },
  {
    key: 'disclaimer',
    blocks: [{ type: 'list', keys: ['availability', 'interruption', 'damages', 'thirdParty'] }],
  },
  {
    key: 'termination',
    blocks: [{ type: 'list', keys: ['userInitiated', 'serviceInitiated', 'dataRetention'] }],
  },
  {
    key: 'cancellation',
    blocks: [
      { type: 'paragraph', key: 'summary' },
      { type: 'link', labelKey: 'details', hrefKey: 'detailsLink' },
    ],
  },
  { key: 'modifications', blocks: [{ type: 'paragraph', key: 'content' }] },
  { key: 'governingLaw', blocks: [{ type: 'list', keys: ['law', 'jurisdiction'] }] },
  {
    key: 'generalProvisions',
    blocks: [{ type: 'list', keys: ['severability', 'entireAgreement', 'waiver', 'assignment'] }],
  },
  {
    key: 'contact',
    blocks: [{ type: 'paragraph', key: 'content', position: 'before' }, { type: 'contact' }],
  },
];

export function LegalContactCard({ data }: { data: LegalContentTree }) {
  return (
    <div className="bg-container rounded-2xl p-4">
      <p className="text-foreground">
        <strong>{readLegalText(data, 'contactLabels', 'email')}:</strong>{' '}
        {dayoptContact.supportEmail}
      </p>
      <p className="text-foreground">
        <strong>{readLegalText(data, 'contactLabels', 'website')}:</strong> {dayoptUrls.marketing}
      </p>
    </div>
  );
}

function StandardLegalDocument({
  data,
  kind,
}: {
  data: LegalContentTree;
  kind: StandardDocumentKind;
}) {
  const sections = kind === 'privacy' ? PRIVACY_SECTIONS : TERMS_SECTIONS;

  return (
    <div className="space-y-8">
      {sections.map((layout) => {
        const section = readLegalTree(data, 'sections', layout.key);

        return (
          <section key={layout.key}>
            <h2 className="mb-4 text-2xl font-medium">{readLegalText(section, 'title')}</h2>
            {layout.blocks.map((block) => {
              const blockKey = `${layout.key}-${block.type}-${'key' in block ? block.key : 'body'}`;

              switch (block.type) {
                case 'paragraph':
                  return (
                    <p key={blockKey} className={getParagraphClassName(block.position)}>
                      {readLegalText(section, block.key)}
                    </p>
                  );
                case 'list':
                  return (
                    <ul
                      key={blockKey}
                      className="text-foreground list-inside list-disc space-y-2 leading-relaxed"
                    >
                      {block.keys.map((key) => (
                        <li key={key}>{readLegalText(section, key)}</li>
                      ))}
                    </ul>
                  );
                case 'note':
                  return (
                    <p key={blockKey} className="text-muted-foreground mt-4 text-sm">
                      {readLegalText(section, block.key)}
                    </p>
                  );
                case 'support-contact':
                  return (
                    <p key={blockKey} className="text-muted-foreground mt-4 text-sm">
                      {readLegalText(section, block.prefixKey)}
                      {dayoptContact.supportEmail}
                      {readLegalText(section, block.suffixKey)}
                    </p>
                  );
                case 'link':
                  return (
                    <p key={blockKey} className="text-foreground mt-4 leading-relaxed">
                      <Link
                        href={block.href ?? readLegalText(section, block.hrefKey ?? '')}
                        className="text-primary underline hover:no-underline"
                      >
                        {readLegalText(section, block.labelKey)}
                      </Link>
                    </p>
                  );
                case 'contact':
                  return <LegalContactCard key={blockKey} data={data} />;
              }
            })}
          </section>
        );
      })}
    </div>
  );
}

export function PrivacyDocument({ data }: { data: LegalContentTree }) {
  return <StandardLegalDocument data={data} kind="privacy" />;
}

export function TermsDocument({ data }: { data: LegalContentTree }) {
  return <StandardLegalDocument data={data} kind="terms" />;
}
