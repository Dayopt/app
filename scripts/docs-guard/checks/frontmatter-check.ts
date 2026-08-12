/**
 * Check: path-aware document metadata
 *
 * - stock: current | superseded + last_verified
 * - project overview: active | paused | done + last_verified
 * - project document: stock contract
 * - newly added log: frozen + filenameと一致するdate
 * - code / superseded_by: 実在するrepo-relative path
 * - product spec: public_docs（公開docsのslug）/ lp（LPの約束文言）の形式
 */

import { glob } from 'glob';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

import {
  colors,
  DOCS_DIR,
  FORBIDDEN_LOG_ALIASES,
  GENERATED_DOCS,
  ROOT,
  ROOT_STOCK_FILES,
  STOCK_DIRS,
} from '../config.ts';
import { listGitChanges, toRepoPath } from '../git-changes.ts';

export interface FrontmatterViolation {
  file: string;
  reason: string;
}

type MetadataValue = string | readonly string[];
type DocumentKind = 'generated' | 'log' | 'project-document' | 'project-overview' | 'stock';

interface ParsedFrontmatter {
  errors: readonly string[];
  fields: ReadonlyMap<string, MetadataValue>;
}

export interface MetadataValidationOptions {
  content: string;
  relativePath: string;
  root?: string;
  today?: string;
}

const STOCK_STATUSES = new Set(['current', 'superseded']);
const PROJECT_STATUSES = new Set(['active', 'paused', 'done']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SPECS_PREFIX = 'docs/product/specs/';
// 公開docsのslug（= /docs/<slug>）。実在検証はしない。未作成のページを宣言できることが
// レジストリの目的で、存在するかどうかは pnpm docs:coverage が報告する。
// FAQ だけ URL が階層化されているため 2 セグメント（faq/pricing）を許す
// （apps/web/src/lib/mdx.ts の NESTED_URL_CATEGORIES を参照）。拡張子とパスは引き続き不可
const DOC_SLUG_SEGMENT = '[a-z0-9]+(?:-[a-z0-9]+)*';
const DOC_SLUG_RE = new RegExp(`^${DOC_SLUG_SEGMENT}(?:/${DOC_SLUG_SEGMENT})?$`);

function stripScalar(value: string): string {
  const withoutComment = value.replace(/\s+#.*$/, '').trim();
  const quote = withoutComment.at(0);
  if (
    (quote === '"' || quote === "'") &&
    withoutComment.at(-1) === quote &&
    withoutComment.length >= 2
  ) {
    return withoutComment.slice(1, -1);
  }
  return withoutComment;
}

export function parseFrontmatter(content: string): ParsedFrontmatter {
  if (!content.startsWith('---\n')) {
    return { errors: ['frontmatterがない'], fields: new Map() };
  }

  const end = content.indexOf('\n---', 4);
  if (end === -1) {
    return { errors: ['frontmatterの終端がない'], fields: new Map() };
  }

  const fields = new Map<string, MetadataValue>();
  const errors: string[] = [];
  let listKey: string | undefined;

  for (const line of content.slice(4, end).split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;

    const keyMatch = line.match(/^([a-z][a-z0-9_-]*):(?:\s*(.*))?$/i);
    if (keyMatch) {
      const [, key, rawValue = ''] = keyMatch;
      if (!key) continue;
      if (fields.has(key)) errors.push(`frontmatterの${key}が重複している`);

      const value = stripScalar(rawValue);
      // 値なしは後続の list item を待つ。`[]` は「意図的に空」を表す確定した空配列
      const isEmptyList = value === '' || value === '[]';
      fields.set(key, isEmptyList ? [] : value);
      listKey = value === '' ? key : undefined;
      continue;
    }

    const listMatch = line.match(/^\s+-\s+(.+)$/);
    if (listMatch && listKey) {
      const value = stripScalar(listMatch[1] ?? '');
      const current = fields.get(listKey);
      const items = Array.isArray(current) ? [...current] : [];
      items.push(value);
      fields.set(listKey, items);
      continue;
    }

    errors.push(`frontmatterを解釈できない: ${line.trim()}`);
  }

  return { errors, fields };
}

function currentDateInTokyo(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
}

function isCalendarDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isValidDate(value: string, today: string): boolean {
  return value <= today && isCalendarDate(value);
}

function getString(fields: ReadonlyMap<string, MetadataValue>, key: string): string | undefined {
  const value = fields.get(key);
  return typeof value === 'string' ? value : undefined;
}

function getStrings(
  fields: ReadonlyMap<string, MetadataValue>,
  key: string,
): readonly string[] | undefined {
  const value = fields.get(key);
  if (typeof value === 'string') return [value];
  return value;
}

function isReadme(path: string): boolean {
  return /\/(readme|index)\.md$/i.test(path);
}

function isLogDocument(path: string): boolean {
  return /^docs\/(business|product|marketing|engineering|operations|company)\/log\//.test(path);
}

function getLogFilenameDate(relativePath: string): string | undefined {
  return relativePath.match(/\/log\/(?:\d{4}\/)?(\d{4}-\d{2}-\d{2})-/)?.[1];
}

export function usesFrozenLogContract(content: string, relativePath: string): boolean {
  const parsed = parseFrontmatter(content);
  const date = getString(parsed.fields, 'date');

  return (
    parsed.errors.length === 0 &&
    getString(parsed.fields, 'status') === 'frozen' &&
    date !== undefined &&
    date === getLogFilenameDate(relativePath) &&
    isCalendarDate(date)
  );
}

export function isFrontmatterSupersededByAddition(
  previousContent: string,
  currentContent: string,
): boolean {
  const previous = parseFrontmatter(previousContent);
  const current = parseFrontmatter(currentContent);
  const currentValue = current.fields.get('superseded_by');

  return (
    previous.errors.length === 0 &&
    !previous.fields.has('superseded_by') &&
    current.errors.length === 0 &&
    typeof currentValue === 'string' &&
    currentValue.length > 0
  );
}

const PARTIAL_CORRECTION_KEY_RE =
  /^partially_superseded_\d{4}_\d{2}_\d{2}_[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isPartialCorrectionKey(key: string): boolean {
  return PARTIAL_CORRECTION_KEY_RE.test(key);
}

// 部分訂正の値は「実在するpath」だけでなく「実際に訂正logであること」まで確認する。
// validateRepoPathだけだと、無関係な既存file（typoで別pathを指す等）でも
// docs:checkが通り、凍結logには訂正済みの印だけが付いて「何が誤りだったか」へ
// 到達できない状態になる（Codexレビューで検出）。
function validatePartialCorrectionTarget(
  root: string,
  value: string,
  field: string,
): string | undefined {
  const pathReason = validateRepoPath(root, value, field);
  if (pathReason) return pathReason;
  if (!isLogDocument(value)) {
    return `${field}はdocs/<domain>/log/配下の訂正logを指す（実在するだけでは不十分）: ${value}`;
  }
  return undefined;
}

/**
 * 部分訂正（#1939）: 既存の凍結logへ、日付+slug付きの新規keyが1本だけ増えているかを
 * 検証する。isSupersedeOnlyDiffの行レベル判定に加え、frontmatter全体をparseした上で
 * 「そのkeyが以前は無かった」ことまで確認する（superseded_by用のisFrontmatterSupersededByAdditionと対）。
 */
export function isFrontmatterPartialCorrectionAddition(
  previousContent: string,
  currentContent: string,
): boolean {
  const previous = parseFrontmatter(previousContent);
  const current = parseFrontmatter(currentContent);
  if (previous.errors.length > 0 || current.errors.length > 0) return false;

  const newPartialCorrectionKeys = [...current.fields.keys()].filter(
    (key) => isPartialCorrectionKey(key) && !previous.fields.has(key),
  );
  if (newPartialCorrectionKeys.length !== 1) return false;

  const [key] = newPartialCorrectionKeys;
  const value = key !== undefined ? current.fields.get(key) : undefined;
  return typeof value === 'string' && value.length > 0;
}

export function classifyDocument(
  relativePath: string,
  isAddedLog: boolean,
): DocumentKind | undefined {
  if (GENERATED_DOCS.includes(relativePath)) return 'generated';
  if (relativePath === 'docs/README.md' || isReadme(relativePath)) return undefined;

  // `_archive/` は完了 Project の移設先（§設計書の保存場所）。同じ contract を
  // そのまま適用する（archive 後も status: done + summary.md の要件は変わらない）。
  if (/^docs\/projects\/(?:_archive\/)?[^/]+\/overview\.md$/.test(relativePath)) {
    return 'project-overview';
  }
  if (/^docs\/projects\/(?:_archive\/)?[^/]+\/[^/]+\.md$/.test(relativePath)) {
    return 'project-document';
  }

  if (isLogDocument(relativePath)) {
    return isAddedLog ? 'log' : undefined;
  }

  if (relativePath.startsWith('docs/_templates/')) return 'stock';
  if (ROOT_STOCK_FILES.includes(relativePath)) return 'stock';
  const domain = relativePath.split('/').at(1);
  if (domain && STOCK_DIRS.includes(domain)) return 'stock';
  return undefined;
}

function validateRepoPath(root: string, value: string, field: string): string | undefined {
  if (!value || isAbsolute(value)) return `${field}はrepo-relative pathで指定する`;
  const absolutePath = resolve(root, value);
  const fromRoot = relative(root, absolutePath);
  if (fromRoot.startsWith('..') || isAbsolute(fromRoot)) {
    return `${field}がrepo外を指している: ${value}`;
  }
  if (!existsSync(absolutePath)) return `${field}のpathが存在しない: ${value}`;
  return undefined;
}

function validateStock(fields: ReadonlyMap<string, MetadataValue>, today: string): string[] {
  const reasons: string[] = [];
  const status = getString(fields, 'status');
  const lastVerified = getString(fields, 'last_verified');

  if (!status) reasons.push('frontmatterにstatusがない');
  else if (!STOCK_STATUSES.has(status)) reasons.push(`stockのstatusが不正: ${status}`);

  if (!lastVerified) reasons.push('frontmatterにlast_verifiedがない');
  else if (!isValidDate(lastVerified, today)) {
    reasons.push(`last_verifiedが有効な過去日付ではない: ${lastVerified}`);
  }
  return reasons;
}

function validateProjectOverview(
  fields: ReadonlyMap<string, MetadataValue>,
  today: string,
  root: string,
  relativePath: string,
): string[] {
  const reasons: string[] = [];
  const status = getString(fields, 'status');
  const lastVerified = getString(fields, 'last_verified');

  if (!status) reasons.push('frontmatterにstatusがない');
  else if (!PROJECT_STATUSES.has(status)) reasons.push(`Projectのstatusが不正: ${status}`);
  else if (relativePath.startsWith('docs/projects/_archive/') && status !== 'done') {
    // _archive/ は完了 Project の移設先（workflow.md §完了後）。done 以外の配置は契約違反。
    reasons.push(`_archive/ 配下のProjectはstatus: doneに限る: ${status}`);
  } else if (!relativePath.startsWith('docs/projects/_archive/') && status === 'done') {
    reasons.push('done Projectは docs/projects/_archive/ へ移す（workflow.md §完了後）');
  }

  if (!lastVerified) reasons.push('frontmatterにlast_verifiedがない');
  else if (!isValidDate(lastVerified, today)) {
    reasons.push(`last_verifiedが有効な過去日付ではない: ${lastVerified}`);
  }

  if (status === 'done') {
    const summaryPath = resolve(root, dirname(relativePath), 'summary.md');
    if (!existsSync(summaryPath)) reasons.push('done Projectにsummary.mdがない');
  }
  return reasons;
}

function validateLog(
  fields: ReadonlyMap<string, MetadataValue>,
  relativePath: string,
  today: string,
): string[] {
  const reasons: string[] = [];
  const status = getString(fields, 'status');
  const date = getString(fields, 'date');
  const filenameDate = getLogFilenameDate(relativePath);

  if (status !== 'frozen') reasons.push('新規logのstatusはfrozenにする');
  if (!filenameDate) reasons.push('新規logのfilenameはYYYY-MM-DD-slug.mdにする');
  if (!date) reasons.push('新規logにdateがない');
  else {
    if (!isValidDate(date, today)) reasons.push(`dateが有効な過去日付ではない: ${date}`);
    if (filenameDate && date !== filenameDate) {
      reasons.push(`dateがfilenameと一致しない: ${date} != ${filenameDate}`);
    }
  }
  return reasons;
}

/**
 * product spec を機能レジストリとして使うための形式検証。
 *
 * public_docs は「この機能に対応する公開docsのslug」、lp は「LPがこの機能について
 * 約束している文言」。どちらも未記入と空配列を区別するため、書くなら形式を守らせる。
 * 実体の突き合わせ（ページの有無、draft/placeholder、LP文言との一致）は
 * pnpm docs:coverage が行う。
 */
function validateSpecRegistry(fields: ReadonlyMap<string, MetadataValue>): string[] {
  const reasons: string[] = [];

  const publicDocs = fields.get('public_docs');
  if (typeof publicDocs === 'string') {
    reasons.push('public_docsは配列で書く（公開docsが無い場合は空配列）');
  } else if (publicDocs !== undefined) {
    for (const slug of publicDocs) {
      if (!DOC_SLUG_RE.test(slug)) {
        reasons.push(`public_docsはkebab-caseのslugで書く（pathや拡張子は書かない）: ${slug}`);
      }
    }
  }

  const lp = fields.get('lp');
  if (typeof lp === 'string') {
    reasons.push('lpは配列で書く（LPが言及しない場合は空配列）');
  } else if (lp !== undefined) {
    for (const claim of lp) {
      if (claim.trim().length === 0) reasons.push('lpの要素が空文字になっている');
    }
  }

  return reasons;
}

export function validateExistingLogSupersededBy(content: string, root = ROOT): string[] {
  const reasons: string[] = [];
  const values = [...content.matchAll(/^superseded_by:\s*(\S+)\s*$/gm)].map((match) => match[1]);

  for (const value of values) {
    if (!value) continue;
    const reason = validateRepoPath(root, value, 'superseded_by');
    if (reason) reasons.push(reason);
  }

  const partialCorrectionMatches = [
    ...content.matchAll(/^(partially_superseded_\d{4}_\d{2}_\d{2}_[a-z0-9-]+):\s*(\S+)\s*$/gm),
  ];
  for (const match of partialCorrectionMatches) {
    const [, key, value] = match;
    if (!key || !value) continue;
    const reason = validatePartialCorrectionTarget(root, value, key);
    if (reason) reasons.push(reason);
  }

  return reasons;
}

export function validateDocumentMetadata({
  content,
  relativePath,
  root = ROOT,
  today = currentDateInTokyo(),
}: MetadataValidationOptions): string[] {
  const kind = classifyDocument(relativePath, true);
  if (!kind) return [];

  if (kind === 'generated') {
    return content.includes('scripts/generate-rls-snapshot.ts') &&
      content.includes('pnpm rls:snapshot') &&
      content.includes('手で編集しない')
      ? []
      : ['generated snapshotに生成元・command・手編集禁止の表示がない'];
  }

  const parsed = parseFrontmatter(content);
  const reasons = [...parsed.errors];

  if (kind === 'project-overview') {
    reasons.push(...validateProjectOverview(parsed.fields, today, root, relativePath));
  } else if (kind === 'log') {
    reasons.push(...validateLog(parsed.fields, relativePath, today));
  } else {
    reasons.push(...validateStock(parsed.fields, today));
  }

  if (relativePath.startsWith(SPECS_PREFIX)) {
    reasons.push(...validateSpecRegistry(parsed.fields));
  }

  const codePaths = getStrings(parsed.fields, 'code');
  if (codePaths?.length === 0) reasons.push('codeを指定する場合はpathを1件以上書く');
  for (const codePath of codePaths ?? []) {
    const reason = validateRepoPath(root, codePath, 'code');
    if (reason) reasons.push(reason);
  }

  const supersededBy = parsed.fields.get('superseded_by');
  if (supersededBy !== undefined) {
    if (typeof supersededBy !== 'string' || supersededBy.length === 0) {
      reasons.push('superseded_byはscalarのrepo-relative pathで指定する');
    } else {
      const reason = validateRepoPath(root, supersededBy, 'superseded_by');
      if (reason) reasons.push(reason);
    }
  }

  for (const [key, value] of parsed.fields) {
    if (!isPartialCorrectionKey(key)) continue;
    if (typeof value !== 'string' || value.length === 0) {
      reasons.push(`${key}はscalarのrepo-relative pathで指定する`);
    } else {
      const reason = validatePartialCorrectionTarget(root, value, key);
      if (reason) reasons.push(reason);
    }
  }

  return reasons;
}

export async function runFrontmatterCheck(): Promise<FrontmatterViolation[]> {
  const violations: FrontmatterViolation[] = [];
  const files = await glob('**/*.md', { cwd: DOCS_DIR, absolute: true });
  const changes = listGitChanges('docs');
  const changesByPath = new Map(changes.map((change) => [change.path, change]));
  const addedPaths = new Set(
    changes.filter((change) => change.status === 'added').map((change) => change.path),
  );

  for (const file of files) {
    const relativePath = toRepoPath(file);
    if (FORBIDDEN_LOG_ALIASES.includes(relativePath)) {
      violations.push({ file, reason: '上書き型log aliasは禁止。日付付きlogを参照する' });
      continue;
    }

    const content = readFileSync(file, 'utf8');
    const change = changesByPath.get(relativePath);
    const kind = classifyDocument(relativePath, addedPaths.has(relativePath));
    if (!kind && isLogDocument(relativePath) && change?.status === 'modified') {
      const reasons = validateExistingLogSupersededBy(content);
      for (const reason of reasons) violations.push({ file, reason });
      continue;
    }
    if (!kind) continue;

    const reasons = validateDocumentMetadata({
      content,
      relativePath,
    });
    for (const reason of reasons) violations.push({ file, reason });
  }

  return violations;
}

export function reportFrontmatterCheck(violations: FrontmatterViolation[]): boolean {
  if (violations.length === 0) {
    console.log(`${colors.green}✓${colors.reset} metadata契約チェック: 0件`);
    return true;
  }

  console.log(`${colors.red}✗${colors.reset} metadata契約チェック: ${violations.length}件`);
  for (const violation of violations) {
    console.log(`  ${colors.yellow}${violation.file}${colors.reset}: ${violation.reason}`);
  }
  return false;
}
