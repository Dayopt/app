/**
 * pnpm docs:coverage
 *
 * 機能・公開docs・LP の埋まり具合を Markdown で出力するレポートツール。
 * 判断材料を出すのが役目なので exit code は常に 0。壊れている状態を止めるのは
 * pnpm docs:check（内部docsの構造）と validate:content（公開docsの契約）の担当。
 */

import { resolve } from 'node:path';

import { colors, ROOT } from '../docs-guard/config.ts';
import {
  buildCoverage,
  collectDocs,
  collectLpClaims,
  collectSpecs,
  LOCALES,
  type Coverage,
  type DocState,
} from './collect.ts';

const SPECS_DIR = resolve(ROOT, 'docs/product/specs');
const DOCS_DIR = resolve(ROOT, 'apps/web/content/docs');
const MARKETING_JSON = resolve(ROOT, 'apps/web/messages/en/marketing.json');

const STATE_LABEL: Record<DocState, string> = {
  published: '公開',
  draft: 'draft（本文あり・公開待ち）',
  placeholder: 'placeholder（未執筆）',
  missing: 'なし',
};

function render(coverage: Coverage): string {
  const lines: string[] = ['# 公開docs カバレッジ', ''];

  lines.push('## 機能 ⇄ 公開docs', '');
  lines.push('| spec | slug | en | ja | LP の約束 |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const row of coverage.rows) {
    const lp = row.lp.length > 0 ? row.lp.join(' / ') : '—';
    lines.push(
      `| ${row.spec} | /docs/${row.slug} | ${STATE_LABEL[row.states.en]} | ${STATE_LABEL[row.states.ja]} | ${lp} |`,
    );
  }
  lines.push('');

  if (coverage.unbackedLpClaims.length > 0) {
    lines.push('## LP が約束しているが対応する spec が無い', '');
    for (const claim of coverage.unbackedLpClaims) lines.push(`- ${claim}`);
    lines.push('');
  }

  if (coverage.staleLpClaims.length > 0) {
    lines.push('## spec が書いている LP 文言が現在の LP に無い', '');
    for (const { spec, claim } of coverage.staleLpClaims) lines.push(`- ${spec}: ${claim}`);
    lines.push('');
  }

  if (coverage.unregisteredSpecs.length > 0) {
    lines.push('## public_docs 未記入の spec', '');
    for (const spec of coverage.unregisteredSpecs) lines.push(`- ${spec}`);
    lines.push('');
  }

  const orphansByLocale = LOCALES.map((locale) => ({
    locale,
    docs: coverage.orphanDocs.filter((doc) => doc.locale === locale),
  })).filter((group) => group.docs.length > 0);

  if (orphansByLocale.length > 0) {
    lines.push('## どの spec にも紐づかない公開docs', '');
    for (const { locale, docs } of orphansByLocale) {
      for (const doc of docs) lines.push(`- ${locale}/${doc.path}（/docs/${doc.slug}）`);
    }
    lines.push('');
  }

  const asymmetric = coverage.rows.filter(
    (row) =>
      (row.states.en === 'missing') !== (row.states.ja === 'missing') ||
      (row.states.en === 'published') !== (row.states.ja === 'published'),
  );
  const orphanSlugs = new Map<string, Set<string>>();
  for (const doc of coverage.orphanDocs) {
    if (!orphanSlugs.has(doc.slug)) orphanSlugs.set(doc.slug, new Set());
    orphanSlugs.get(doc.slug)?.add(doc.locale);
  }
  const orphanAsymmetric = [...orphanSlugs.entries()].filter(([, locales]) => locales.size < 2);

  if (asymmetric.length > 0 || orphanAsymmetric.length > 0) {
    lines.push('## en / ja が揃っていない', '');
    for (const row of asymmetric) {
      lines.push(
        `- /docs/${row.slug}: en=${STATE_LABEL[row.states.en]} / ja=${STATE_LABEL[row.states.ja]}`,
      );
    }
    for (const [slug, locales] of orphanAsymmetric) {
      lines.push(`- /docs/${slug}: ${[...locales].join(', ')} のみ`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function main(): void {
  const coverage = buildCoverage(
    collectSpecs(SPECS_DIR),
    collectDocs(DOCS_DIR),
    collectLpClaims(MARKETING_JSON),
  );

  console.log(render(coverage));

  const published = coverage.rows.filter(
    (row) => row.states.en === 'published' && row.states.ja === 'published',
  ).length;
  console.log(
    `${colors.cyan}${published}/${coverage.rows.length}${colors.reset} が en/ja 揃って公開済み`,
  );
}

main();
