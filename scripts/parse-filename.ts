#!/usr/bin/env node
/**
 * Storycap スクリーンショット ファイル名パーサー
 *
 * ファイル名からコンポーネントメタデータを抽出し、
 * Eagle用のタグ配列・格納先フォルダ・メモ用アノテーションを生成する。
 *
 * フォルダ構造は Storybook のタイトル階層をそのまま反映:
 *   Components/UI/Button → Eagle フォルダ Components/UI
 *   Features/Entry/Card  → Eagle フォルダ Features/Entry
 *   Foundations/Colors    → Eagle フォルダ Foundations
 *
 * Usage:
 *   import { parseScreenshotFilename, buildAnnotation } from './parse-filename.js';
 *
 * テスト実行:
 *   npx tsx scripts/parse-filename.ts
 */

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

export interface ParsedScreenshot {
  /** コンポーネント名（kebab-case） */
  componentName: string;
  /** Story バリアント名 */
  variant: string;
  /** テーマ */
  theme: 'light' | 'dark' | undefined;
  /** ビューポート */
  viewport: 'mobile' | 'desktop' | undefined;
  /** Eagle 自動タグ配列 */
  tags: string[];
  /** Eagle 格納先フォルダパス（Storybook 階層に準拠） */
  folderPath: string;
  /** Eagle 表示名（拡張子なし） */
  baseName: string;
  /** 元ファイル名 */
  originalFilename: string;
}

// ─────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────

const THEMES = new Set(['light', 'dark']);
const VIEWPORTS = new Set(['mobile', 'desktop']);

/** スキップ対象のプレフィックス */
const SKIP_PREFIXES = [/^Docs[_/]/i, /^Patterns[_/]/i];

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

/** PascalCase / camelCase → kebab-case */
function toKebabCase(str: string): string {
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .toLowerCase();
}

/** バリアント文字列からテーマとビューポートを抽出 */
function extractSuffixes(parts: string[]): {
  theme: 'light' | 'dark' | undefined;
  viewport: 'mobile' | 'desktop' | undefined;
  remaining: string[];
} {
  let theme: 'light' | 'dark' | undefined;
  let viewport: 'mobile' | 'desktop' | undefined;
  const remaining: string[] = [];

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (THEMES.has(lower) && !theme) {
      theme = lower as 'light' | 'dark';
    } else if (VIEWPORTS.has(lower) && !viewport) {
      viewport = lower as 'mobile' | 'desktop';
    } else {
      remaining.push(lower);
    }
  }

  return { theme, viewport, remaining };
}

// ─────────────────────────────────────────────────────────
// Parser
// ─────────────────────────────────────────────────────────

/**
 * ファイル名をパース
 *
 * 例: Components_UI_Button--AllPatterns_dark_mobile.png
 *   → folderPath: "Components/UI"
 *   → componentName: "button"
 *   → variant: "allpatterns"
 *   → theme: "dark", viewport: "mobile"
 */
export function parseScreenshotFilename(filename: string): ParsedScreenshot {
  const stem = filename.replace(/\.png$/i, '');

  // story path と variant を分離
  const variantSep = stem.indexOf('--');
  if (variantSep === -1) {
    throw new Error(`ファイル名をパースできません（-- がない）: ${filename}`);
  }

  const storyPath = stem.slice(0, variantSep);
  const variantRaw = stem.slice(variantSep + 2);

  // storyPath をセグメントに分割
  const pathSegments = storyPath.split(/[_/]/).filter(Boolean);
  if (pathSegments.length === 0) {
    throw new Error(`ファイル名をパースできません（パスが空）: ${filename}`);
  }

  // コンポーネント名 = 最後のセグメント
  const componentNameRaw = pathSegments[pathSegments.length - 1];
  const componentName = toKebabCase(componentNameRaw);

  // フォルダパス = 最後のセグメント以外（Storybook 階層そのまま）
  // セグメントが1つだけの場合はそのセグメント自体がフォルダ
  const folderPath =
    pathSegments.length > 1 ? pathSegments.slice(0, -1).join('/') : pathSegments[0];

  // バリアントからテーマ・ビューポートを抽出
  const variantParts = variantRaw.split(/[_-]/);
  const { theme, viewport, remaining } = extractSuffixes(variantParts);
  const variant = remaining.join('-') || 'default';

  // タグ配列を構築
  const tags: string[] = ['component', 'current', componentName];
  // パスの各セグメントもタグに（小文字）
  for (const seg of pathSegments.slice(0, -1)) {
    const tag = toKebabCase(seg);
    if (!tags.includes(tag)) tags.push(tag);
  }
  if (variant !== 'default') tags.push(variant);
  if (theme) tags.push(theme);
  if (viewport) tags.push(viewport);

  // Feature セクションタグ（パスに含まれるセクション名を自動付与）
  const featureSections = [
    'calendar',
    'stats',
    'settings',
    'entry',
    'auth',
    'tags',
    'tour',
    'onboarding',
    'chronotype',
    'notifications',
    'palette',
    'search',
    'contact',
  ];
  for (const section of featureSections) {
    if (storyPath.toLowerCase().includes(section) && !tags.includes(section)) {
      tags.push(section);
      break;
    }
  }

  const suffixParts = [theme, viewport].filter(Boolean);
  const baseName =
    `${componentName}--${variant}` + (suffixParts.length > 0 ? `-${suffixParts.join('-')}` : '');

  return {
    componentName,
    variant,
    theme,
    viewport,
    tags,
    folderPath,
    baseName,
    originalFilename: filename,
  };
}

// ─────────────────────────────────────────────────────────
// Annotation Builder
// ─────────────────────────────────────────────────────────

/**
 * Eagle メモフィールド用のアノテーション文字列を構築
 */
export function buildAnnotation(params: {
  parsed: ParsedScreenshot;
  storybookPort?: number;
  sourceBasePath?: string;
  capturedAt: Date;
  hash: string;
}): string {
  const port = params.storybookPort ?? 6006;
  const basePath = params.sourceBasePath ?? 'src/components';

  const storyId = `${params.parsed.componentName}--${params.parsed.variant}`;

  const lines = [
    `storybook: http://localhost:${port}/?path=/story/${storyId}`,
    `source: ${basePath}/${params.parsed.componentName}`,
    `captured: ${params.capturedAt.toISOString()}`,
    `storycap-hash: ${params.hash}`,
  ];

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────
// Skip Check
// ─────────────────────────────────────────────────────────

/** Docs/ や Patterns/ など、デザインアセットでないストーリーを判定 */
export function isSkippable(filename: string): boolean {
  const stem = filename.replace(/\.png$/i, '');
  return SKIP_PREFIXES.some((re) => re.test(stem));
}

// ─────────────────────────────────────────────────────────
// Self-test（直接実行時）
// ─────────────────────────────────────────────────────────

const isDirectRun =
  import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('parse-filename.ts');

if (isDirectRun) {
  const testCases = [
    'Components_UI_Button--Primary_dark_mobile.png',
    'Components_UI_Button--AllPatterns_light_mobile.png',
    'Components_Shell_AppHeader--Default_dark_mobile.png',
    'Features_Entry_Card--WithRecord_light_mobile.png',
    'Features_Settings_DisplaySettings--Default_dark_mobile.png',
    'Features_Calendar_Sidebar_TagFilter_CreateTagButton--Default_light_mobile.png',
    'Foundations_Colors--AllColors_light_mobile.png',
    'Foundations--DesignSystem_dark_mobile.png',
    // スキップ対象
    'Docs_Introduction--Default.png',
    'Patterns_Forms--Default.png',
  ];

  console.log('═══════════════════════════════════════════');
  console.log('  parse-filename.ts セルフテスト');
  console.log('═══════════════════════════════════════════\n');

  for (const tc of testCases) {
    if (isSkippable(tc)) {
      console.log(`⏭️  SKIP: ${tc}`);
      continue;
    }

    try {
      const parsed = parseScreenshotFilename(tc);
      console.log(`✅ ${tc}`);
      console.log(`   component: ${parsed.componentName}`);
      console.log(`   variant:   ${parsed.variant}`);
      console.log(`   theme:     ${parsed.theme ?? '(none)'}`);
      console.log(`   viewport:  ${parsed.viewport ?? '(none)'}`);
      console.log(`   folder:    ${parsed.folderPath}`);
      console.log(`   tags:      [${parsed.tags.join(', ')}]`);
      console.log(`   baseName:  ${parsed.baseName}`);
    } catch (e) {
      console.log(`❌ ${tc}: ${(e as Error).message}`);
    }
    console.log();
  }
}
