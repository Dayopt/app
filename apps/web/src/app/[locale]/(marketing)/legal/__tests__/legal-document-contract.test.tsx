// @vitest-environment happy-dom
/**
 * 法務文書（privacy/terms/cookies/tokushoho/security × en/ja）の変更検知契約。
 *
 * 旧 apps/web/src/test/e2e/i18n-smoke.spec.ts の `legal pages` describe を移設したもの
 * （2026-08 CI monorepo Phase 5, issue #1815）。「本文が勝手に変わっていないこと」を守る
 * のが目的で、ブラウザを起動せず getLegalDocument / generateMetadata /
 * legalMdxComponents という本番と同一の部品を直接 Vitest 上で実行して検証する。
 *
 * **MDX のコンパイル経路だけは本番と異なる。** 本番の LegalDocument.tsx は
 * `next-mdx-remote/rsc`（Server Component 経路）を使うが、Vitest で RSC は描画できない
 * ため、ここでは同じ LEGAL_MDX_OPTIONS を渡した `serialize` + 非 RSC の MDXRemote を使う。
 * 両経路の出力が一致することは、移設元の Playwright（実ブラウザ = 本番経路）が持っていた
 * hash / 見出し数 / href の期待値と byte 一致することで確認した。**legal component に
 * RSC 固有の機能（async component、server-only import）を持ち込むとこの前提が崩れ、
 * テストは通るのに本番の出力だけが変わる**ため、その時はテスト側の経路も見直すこと。
 *
 * MDX ソースはプレーンな Markdown ではなく `<XxxDocument data={{...}} />` という
 * JSX props（object literal）で本文を持つため、見出し数・table・list の構造は
 * MDX テキストの静的パース（正規表現等）だけでは再現できず、実際に
 * `_components/legal-*-document.tsx` のレイアウト定義（例: legal-standard-document.tsx の
 * PRIVACY_SECTIONS/TERMS_SECTIONS）を通して初めて決まる。そのため本テストは
 * 「MDX 本文のみの hash」ではなく「実際にレンダリングした結果」を hash / 計測する。
 * next/link・next-intl navigation の Link は Next.js Router Context が無い環境でも
 * href を保持したまま描画されるよう、素の <a> に差し替える。
 *
 * `<h1>` は LegalDocument.tsx（コンポーネント側）が常に 1 個描画する構造で、
 * MDX 本文の内容に関わらず不変のため、この契約の対象に含めない。
 */
import { cleanup, render } from '@testing-library/react';
import { MDXRemote } from 'next-mdx-remote';
import { serialize } from 'next-mdx-remote/serialize';
import { createHash } from 'node:crypto';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { legalMdxComponents } from '../_components/legal-mdx-components';
import { LEGAL_MDX_OPTIONS } from '../_components/legal-mdx-options';
import { getLegalDocument, type LegalDocumentSlug } from '../_lib/legal-content';
import { generateMetadata as generateCookiesMetadata } from '../cookies/page';
import { generateMetadata as generatePrivacyMetadata } from '../privacy/page';
import { generateMetadata as generateSecurityMetadata } from '../security/page';
import { generateMetadata as generateTermsMetadata } from '../terms/page';
import { generateMetadata as generateTokushohoMetadata } from '../tokushoho/page';

vi.mock('@dayopt/i18n/navigation', () => ({
  Link: ({ children, href, ...rest }: { children: ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const GENERATE_METADATA: Record<LegalDocumentSlug, typeof generatePrivacyMetadata> = {
  privacy: generatePrivacyMetadata,
  terms: generateTermsMetadata,
  cookies: generateCookiesMetadata,
  tokushoho: generateTokushohoMetadata,
  security: generateSecurityMetadata,
};

interface LegalContractCase {
  locale: 'en' | 'ja';
  slug: LegalDocumentSlug;
  metadataTitle: string;
  metadataDescription: string;
  /** sha256(レンダリング後 body の textContent)。本文が1文字でも変わると落ちる。 */
  bodyHash: string;
  hrefs: readonly (string | null)[];
  counts: { h2: number; h3: number; tables: number; lists: number };
}

const LEGAL_CONTRACT_CASES: readonly LegalContractCase[] = [
  {
    locale: 'en',
    slug: 'privacy',
    metadataTitle: 'Privacy Policy - Dayopt',
    metadataDescription: 'How Dayopt handles your personal information',
    bodyHash: '2458fee563cfd793663f7acef25c12f16a986f700528f0a0f562c02cc7df3e74',
    hrefs: ['/legal/cookies'],
    counts: { h2: 19, h3: 0, tables: 0, lists: 15 },
  },
  {
    locale: 'en',
    slug: 'terms',
    metadataTitle: 'Terms of Service - Dayopt',
    metadataDescription: 'Our terms and conditions for using the Dayopt service',
    bodyHash: '5fc2330a36f9431d809be15641f025c596ff43e4f65b13a03983cdeb7e82ad48',
    hrefs: ['/legal/refund'],
    counts: { h2: 20, h3: 0, tables: 0, lists: 15 },
  },
  {
    locale: 'en',
    slug: 'cookies',
    metadataTitle: 'Cookie Policy - Dayopt',
    metadataDescription: 'How Dayopt uses cookies and similar technologies',
    bodyHash: 'b113bd6e71ca4bbbe3be13fb30d9c7fff808e4ecc73b10b2090e1199b3db0490',
    hrefs: ['/legal/privacy'],
    counts: { h2: 10, h3: 4, tables: 1, lists: 2 },
  },
  {
    locale: 'en',
    slug: 'tokushoho',
    metadataTitle: 'Specified Commercial Transactions Act - Dayopt',
    metadataDescription:
      'Information required under the Act on Specified Commercial Transactions (Japan)',
    bodyHash: 'a2f763a39d7f99d256a65c32d9da611f9928e30ab5701964ff1291382ab5101a',
    hrefs: [],
    counts: { h2: 0, h3: 0, tables: 1, lists: 4 },
  },
  {
    locale: 'en',
    slug: 'security',
    metadataTitle: 'Security - Dayopt',
    metadataDescription:
      'Dayopt implements the highest standards of security to protect your information.',
    bodyHash: '0713c3984851d02dbb5fbffa54cd6d5867c6963a01b2eb56fdbf1a037d08d40e',
    hrefs: [
      'mailto:security@dayopt.app',
      'https://github.com/Dayopt/dayopt/security/advisories/new',
      'https://github.com/Dayopt/dayopt/blob/main/docs/legal/SECURITY.md',
      'https://github.com/Dayopt/dayopt/blob/main/docs/legal/VULNERABILITY_DISCLOSURE.md',
      'https://github.com/Dayopt/dayopt/blob/main/docs/legal/INCIDENT_RESPONSE.md',
      '/legal/privacy',
      'mailto:security@dayopt.app',
      'mailto:support@dayopt.app',
    ],
    counts: { h2: 5, h3: 10, tables: 2, lists: 5 },
  },
  {
    locale: 'ja',
    slug: 'privacy',
    metadataTitle: 'プライバシーポリシー - Dayopt',
    metadataDescription: 'Dayoptにおける個人情報の取り扱いについて',
    bodyHash: '65f771fd0c89ac5c012260d1093b97e362b10b20d348a89461448d5dbe9139a9',
    hrefs: ['/legal/cookies'],
    counts: { h2: 19, h3: 0, tables: 0, lists: 15 },
  },
  {
    locale: 'ja',
    slug: 'terms',
    metadataTitle: '利用規約 - Dayopt',
    metadataDescription: 'Dayoptサービスの利用に関する規約',
    bodyHash: '2529cb009705185d1b089f6585c49be2fb71ec84933aae4273dbb4ce3f322d2e',
    hrefs: ['/legal/refund'],
    counts: { h2: 20, h3: 0, tables: 0, lists: 15 },
  },
  {
    locale: 'ja',
    slug: 'cookies',
    metadataTitle: 'Cookieポリシー - Dayopt',
    metadataDescription: 'Dayoptにおけるクッキーおよび類似技術の使用について',
    bodyHash: '59c4ccd3399f7cf02b2139e46a7977bd1a535b9053892b3d054f82fe4da3b871',
    hrefs: ['/legal/privacy'],
    counts: { h2: 10, h3: 4, tables: 1, lists: 2 },
  },
  {
    locale: 'ja',
    slug: 'tokushoho',
    metadataTitle: '特定商取引法に基づく表記 - Dayopt',
    metadataDescription: '特定商取引法に基づく通信販売業者の表示義務に関する情報',
    bodyHash: 'b872197d12c3fc8a15833e13d45e11b35a09fb6d1319c7200f2a09f2cf48771f',
    hrefs: [],
    counts: { h2: 0, h3: 0, tables: 1, lists: 4 },
  },
  {
    locale: 'ja',
    slug: 'security',
    metadataTitle: 'セキュリティ - Dayopt',
    metadataDescription:
      'Dayoptは、ユーザーの皆様の情報を保護するために、最高水準のセキュリティ対策を実施しています。',
    bodyHash: '7ccba2a1c8e3e578d3840f36e0a1f61c09c211f2aa01100a026ed33bf167fca7',
    hrefs: [
      'mailto:security@dayopt.app',
      'https://github.com/Dayopt/dayopt/security/advisories/new',
      'https://github.com/Dayopt/dayopt/blob/main/docs/legal/SECURITY.md',
      'https://github.com/Dayopt/dayopt/blob/main/docs/legal/VULNERABILITY_DISCLOSURE.md',
      'https://github.com/Dayopt/dayopt/blob/main/docs/legal/INCIDENT_RESPONSE.md',
      // SecurityDocument の relatedDocs リンクは next/link を直接使っており
      // locale prefix が付かない（既存挙動。/ja/legal/privacy にはならない）。
      '/legal/privacy',
      'mailto:security@dayopt.app',
      'mailto:support@dayopt.app',
    ],
    counts: { h2: 5, h3: 10, tables: 2, lists: 5 },
  },
];

afterEach(() => {
  cleanup();
});

describe('legal document contract', () => {
  for (const testCase of LEGAL_CONTRACT_CASES) {
    it(`${testCase.locale}/${testCase.slug} の metadata と本文構造を維持する`, async () => {
      const metadata = await GENERATE_METADATA[testCase.slug]({
        params: Promise.resolve({ locale: testCase.locale }),
      });
      expect(metadata.title).toBe(testCase.metadataTitle);
      expect(metadata.description).toBe(testCase.metadataDescription);

      const document = getLegalDocument(testCase.locale, testCase.slug);
      const compiled = await serialize(document.content, LEGAL_MDX_OPTIONS);
      const { container } = render(<MDXRemote {...compiled} components={legalMdxComponents} />);

      const bodyText = (container as HTMLElement).textContent ?? '';
      expect(createHash('sha256').update(bodyText).digest('hex')).toBe(testCase.bodyHash);

      const hrefs = Array.from(container.querySelectorAll('a')).map((anchor) =>
        anchor.getAttribute('href'),
      );
      expect(hrefs).toEqual(testCase.hrefs);

      expect({
        h2: container.querySelectorAll('h2').length,
        h3: container.querySelectorAll('h3').length,
        tables: container.querySelectorAll('table').length,
        lists: container.querySelectorAll('ul, ol').length,
      }).toEqual(testCase.counts);
    });
  }
});
