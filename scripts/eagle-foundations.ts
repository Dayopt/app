#!/usr/bin/env node
/**
 * eagle-foundations: デザイントークンを Eagle Foundations フォルダに取り込む
 *
 * 処理:
 *   1. Foundations/Colors — colors.css のカラートークン → PNG スウォッチ
 *   2. Foundations/Typography — Inter, Noto Sans JP の .ttf をダウンロード
 *   3. Foundations/Icons — プロジェクトで使用中の Lucide アイコン → SVG
 *
 * Usage:
 *   npx tsx scripts/eagle-foundations.ts
 *   npx tsx scripts/eagle-foundations.ts --dry-run
 *   npx tsx scripts/eagle-foundations.ts --colors-only
 *   npx tsx scripts/eagle-foundations.ts --fonts-only
 *   npx tsx scripts/eagle-foundations.ts --icons-only
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { formatHex, oklch } from 'culori';
import sharp from 'sharp';

import {
  checkConnection,
  createFolder,
  findFolderByPath,
  getFolderList,
  type EagleFolder,
} from './eagle-api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// ─────────────────────────────────────────────────────────
// Args
// ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const COLORS_ONLY = args.includes('--colors-only');
const FONTS_ONLY = args.includes('--fonts-only');
const ICONS_ONLY = args.includes('--icons-only');

const runColors = !FONTS_ONLY && !ICONS_ONLY;
const runFonts = !COLORS_ONLY && !ICONS_ONLY;
const runIcons = !COLORS_ONLY && !FONTS_ONLY;

// ─────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────

const SWATCH_SIZE = 200;
const ICON_SIZE = 128;
const TMP_DIR = path.join(os.tmpdir(), 'eagle-foundations');
const MCP_URL = 'http://127.0.0.1:41596/api/tools/call';
const TIMEOUT_MS = 15_000;

// ─────────────────────────────────────────────────────────
// MCP direct caller
// ─────────────────────────────────────────────────────────

async function callMcp<T>(tool: string, params: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool, params }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Eagle MCP error [${tool}] (${res.status}): ${text}`);
  }
  return JSON.parse(text) as T;
}

// ─────────────────────────────────────────────────────────
// Logging
// ─────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(`[eagle-foundations] ${msg}`);
}

function logDry(msg: string) {
  if (DRY_RUN) console.log(`  [DRY RUN] ${msg}`);
}

// ─────────────────────────────────────────────────────────
// Folder helpers
// ─────────────────────────────────────────────────────────

async function ensureFolderPath(
  folderPath: string,
  roots: EagleFolder[],
  pathToId: Map<string, string>,
): Promise<string> {
  const cached = pathToId.get(folderPath);
  if (cached) return cached;

  const existing = findFolderByPath(folderPath, roots);
  if (existing) {
    pathToId.set(folderPath, existing.id);
    return existing.id;
  }

  const parts = folderPath.split('/');
  const name = parts[parts.length - 1];
  let parentId: string | undefined;

  if (parts.length > 1) {
    const parentPath = parts.slice(0, -1).join('/');
    parentId = await ensureFolderPath(parentPath, roots, pathToId);
  }

  if (DRY_RUN) {
    logDry(`Would create folder: ${folderPath}`);
    const dryId = `dry-${folderPath}`;
    pathToId.set(folderPath, dryId);
    return dryId;
  }

  log(`📁 Creating folder: ${folderPath}`);
  const created = await createFolder({ name, parentId });
  pathToId.set(folderPath, created.id);
  return created.id;
}

// ─────────────────────────────────────────────────────────
// Eagle import helper
// ─────────────────────────────────────────────────────────

async function addItemToEagle(params: {
  filePath: string;
  name: string;
  tags: string[];
  folderId: string;
  annotation?: string;
  star?: number;
}): Promise<string> {
  const result = await callMcp<{ data: Array<{ itemId: string }> }>('item_add', {
    tags: params.tags,
    folders: [params.folderId],
    ...(params.annotation && { annotation: params.annotation }),
    items: [
      {
        source: { type: 'path', path: params.filePath },
        name: params.name,
      },
    ],
  });

  const itemId = result.data[0].itemId;

  if (params.star !== undefined) {
    await callMcp('item_update', {
      items: [{ id: itemId }],
      star: params.star,
    });
  }

  return itemId;
}

// ═════════════════════════════════════════════════════════
// Colors
// ═════════════════════════════════════════════════════════

interface ColorToken {
  name: string;
  value: string;
  group: string;
  mode: 'light' | 'dark';
}

function buildVarMap(): Map<string, string> {
  const varMap = new Map<string, string>();

  const primPath = path.join(ROOT, 'src/styles/tokens/primitives.css');
  const primCss = fs.readFileSync(primPath, 'utf-8');
  for (const line of primCss.split('\n')) {
    const m = line.match(/^\s*--([\w-]+):\s*(.+?)\s*;/);
    if (m) varMap.set(`--${m[1]}`, m[2]);
  }

  const colorsPath = path.join(ROOT, 'src/styles/tokens/colors.css');
  const colorsCss = fs.readFileSync(colorsPath, 'utf-8');
  for (const line of colorsCss.split('\n')) {
    const m = line.match(/^\s*--([\w-]+):\s*(.+?)\s*;/);
    if (m) {
      const key = `--${m[1]}`;
      if (!varMap.has(key)) varMap.set(key, m[2]);
    }
  }

  return varMap;
}

function resolveVars(value: string, varMap: Map<string, string>, depth = 0): string {
  if (depth > 5 || !value.includes('var(')) return value;
  return resolveVars(
    value.replace(/var\(--([\w-]+)\)/g, (_, name) => varMap.get(`--${name}`) ?? `var(--${name})`),
    varMap,
    depth + 1,
  );
}

function parseColorTokens(): ColorToken[] {
  const cssPath = path.join(ROOT, 'src/styles/tokens/colors.css');
  const css = fs.readFileSync(cssPath, 'utf-8');
  const varMap = buildVarMap();

  const tokens: ColorToken[] = [];
  let currentMode: 'light' | 'dark' = 'light';

  for (const line of css.split('\n')) {
    if (line.includes('.dark')) currentMode = 'dark';

    const match = line.match(/^\s*--([\w-]+):\s*(.+?)\s*;/);
    if (!match) continue;

    const [, name, rawValue] = match;

    if (name.startsWith('shadow')) continue;
    if (
      [
        'card-foreground',
        'secondary',
        'secondary-foreground',
        'accent',
        'accent-foreground',
        'ring',
      ].includes(name)
    )
      continue;

    const resolved = resolveVars(rawValue, varMap);
    if (!resolved.includes('oklch(')) continue;

    const group = getColorGroup(name);
    tokens.push({ name, value: resolved, group, mode: currentMode });
  }

  return tokens;
}

function getColorGroup(name: string): string {
  if (name.startsWith('tag-') && name.endsWith('-tint')) return 'Tag Tints';
  if (name.startsWith('tag-')) return 'Tag Colors';
  if (name.startsWith('badge-')) return 'Badge';
  if (name.startsWith('chronotype-')) return 'Chronotype';
  if (name.startsWith('chart-')) return 'Charts';
  if (name.startsWith('heatmap-')) return 'Heatmap';
  if (name.startsWith('fulfillment-')) return 'Fulfillment';
  if (name.startsWith('now-indicator')) return 'Now Indicator';
  if (
    name.startsWith('destructive') ||
    name.startsWith('warning') ||
    name.startsWith('success') ||
    name.startsWith('info')
  )
    return 'Semantic';
  if (
    ['background', 'foreground', 'container', 'card', 'muted', 'overlay'].some((s) =>
      name.startsWith(s),
    )
  )
    return 'Surface';
  if (name.startsWith('primary')) return 'Primary';
  if (name.startsWith('state-active') || name.startsWith('accent')) return 'State';
  if (name.startsWith('entry-')) return 'Entry';
  return 'Other';
}

function oklchToHex(oklchStr: string): string | null {
  const match = oklchStr.match(
    /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)/,
  );
  if (!match) return null;

  const l = parseFloat(match[1]);
  const c = parseFloat(match[2]);
  const h = parseFloat(match[3]);

  const color = oklch({ l, c, h, mode: 'oklch' });
  const hex = formatHex(color);
  return hex ?? null;
}

async function generateSwatch(hex: string, outputPath: string): Promise<void> {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  await sharp({
    create: {
      width: SWATCH_SIZE,
      height: SWATCH_SIZE,
      channels: 3,
      background: { r, g, b },
    },
  })
    .png()
    .toFile(outputPath);
}

async function importColors(
  colorsFolderId: string,
): Promise<{ added: number; skipped: number; errors: number }> {
  const tokens = parseColorTokens();
  const lightTokens = tokens.filter((t) => t.mode === 'light');

  log(`Found ${lightTokens.length} color tokens (light mode)`);

  let added = 0;
  let skipped = 0;
  let errors = 0;

  for (const token of lightTokens) {
    const hex = oklchToHex(token.value);
    if (!hex) {
      log(`⏭️  Skip (no hex): --${token.name}`);
      skipped++;
      continue;
    }

    const swatchPath = path.join(TMP_DIR, `color-${token.name}.png`);

    if (DRY_RUN) {
      logDry(`Would add color: --${token.name} (${hex}) → Foundations/Colors`);
      added++;
      continue;
    }

    try {
      await generateSwatch(hex, swatchPath);

      const annotation = [
        `token: --${token.name}`,
        `value: ${token.value}`,
        `hex: ${hex}`,
        `group: ${token.group}`,
        `source: src/styles/tokens/colors.css`,
      ].join('\n');

      await addItemToEagle({
        filePath: swatchPath,
        name: `${token.name} (${hex})`,
        tags: ['foundations', 'color', token.group.toLowerCase().replace(/\s+/g, '-'), token.name],
        folderId: colorsFolderId,
        annotation,
        star: 5,
      });

      log(`🎨 Added: --${token.name} ${hex}`);
      added++;
    } catch (e) {
      log(`❌ Error: --${token.name}: ${(e as Error).message}`);
      errors++;
    }
  }

  return { added, skipped, errors };
}

// ═════════════════════════════════════════════════════════
// Fonts (.ttf via Google Fonts download ZIP)
// ═════════════════════════════════════════════════════════

interface FontFile {
  family: string;
  weight: string;
  path: string;
  filename: string;
}

/**
 * GitHub releases から .ttf をダウンロード（Inter）
 * Google Fonts download API から .ttf を取得（Noto Sans JP 等）
 */
async function downloadInterFromGitHub(weights: string[]): Promise<FontFile[]> {
  const { execSync } = await import('node:child_process');
  const zipUrl = 'https://github.com/rsms/inter/releases/download/v4.1/Inter-4.1.zip';
  const zipPath = path.join(TMP_DIR, 'Inter-4.1.zip');
  const extractDir = path.join(TMP_DIR, 'inter-extracted');

  log('Downloading Inter from GitHub releases...');
  const zipRes = await fetch(zipUrl, {
    signal: AbortSignal.timeout(60_000),
    redirect: 'follow',
  });
  if (!zipRes.ok) {
    log(`⚠️  Failed to download Inter zip: ${zipRes.status}`);
    return [];
  }

  fs.writeFileSync(zipPath, Buffer.from(await zipRes.arrayBuffer()));
  fs.mkdirSync(extractDir, { recursive: true });
  execSync(`unzip -o -q "${zipPath}" -d "${extractDir}"`);

  // Find static TTF files (not variable)
  const weightMap: Record<string, string> = {
    '400': 'Regular',
    '500': 'Medium',
    '700': 'Bold',
  };

  const results: FontFile[] = [];
  for (const weight of weights) {
    const label = weightMap[weight];
    if (!label) continue;

    // Search for Inter-{Label}.ttf in extracted files
    const found = execSync(`find "${extractDir}" -name "Inter-${label}.ttf" -type f 2>/dev/null`, {
      encoding: 'utf-8',
    }).trim();

    if (!found) {
      // Fallback: try InterDisplay or variable
      log(`⚠️  Inter-${label}.ttf not found, trying variable font...`);
      const varFound = execSync(
        `find "${extractDir}" -name "Inter-VariableFont_*.ttf" -type f 2>/dev/null | head -1`,
        { encoding: 'utf-8' },
      ).trim();
      if (varFound && weight === '400') {
        const filename = `Inter-Variable.ttf`;
        const destPath = path.join(TMP_DIR, filename);
        fs.copyFileSync(varFound, destPath);
        results.push({ family: 'Inter', weight: '400', path: destPath, filename });
      }
      continue;
    }

    const firstMatch = found.split('\n')[0];
    const filename = `Inter-${label}.ttf`;
    const destPath = path.join(TMP_DIR, filename);
    fs.copyFileSync(firstMatch, destPath);
    results.push({ family: 'Inter', weight, path: destPath, filename });
  }

  return results;
}

async function downloadNotoSansJP(weights: string[]): Promise<FontFile[]> {
  log('Downloading Noto Sans JP .ttf from Google Fonts API...');

  // Google Fonts API v1 + old Android UA → returns TTF format
  const weightStr = weights.join(',');
  const apiUrl = `https://fonts.googleapis.com/css?family=Noto+Sans+JP:${weightStr}`;

  const cssRes = await fetch(apiUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Linux; U; Android 2.3.5; en-us; HTC Vision Build/GRI40) AppleWebKit/533.1 (KHTML, like Gecko) Version/4.0 Mobile Safari/533.1',
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!cssRes.ok) {
    log(`⚠️  Failed to fetch Noto Sans JP CSS: ${cssRes.status}`);
    return [];
  }

  const css = await cssRes.text();
  const results: FontFile[] = [];
  const weightMap: Record<string, string> = { '400': 'Regular', '500': 'Medium' };

  for (const weight of weights) {
    // Find the @font-face block for this weight
    const blockRegex = new RegExp(
      `font-weight:\\s*${weight};[\\s\\S]*?src:\\s*url\\(([^)]+\\.ttf[^)]*)\\)`,
    );
    const match = css.match(blockRegex);
    if (!match) {
      log(`⚠️  No TTF URL found for Noto Sans JP ${weight}`);
      continue;
    }

    const fontUrl = match[1];
    const fontRes = await fetch(fontUrl, { signal: AbortSignal.timeout(60_000) });
    if (!fontRes.ok) {
      log(`⚠️  Failed to download: ${fontUrl}`);
      continue;
    }

    const buffer = Buffer.from(await fontRes.arrayBuffer());
    const label = weightMap[weight] ?? weight;
    const filename = `NotoSansJP-${label}.ttf`;
    const filePath = path.join(TMP_DIR, filename);

    fs.writeFileSync(filePath, buffer);
    results.push({ family: 'Noto Sans JP', weight, path: filePath, filename });
  }

  return results;
}

async function importFonts(typoFolderId: string): Promise<{ added: number; errors: number }> {
  log('Downloading .ttf fonts...');

  // 400(Regular), 500(Medium) のみ — 700(bold)は不使用 (src/app/layout.tsx)
  const interFonts = await downloadInterFromGitHub(['400', '500']);
  const notoFonts = await downloadNotoSansJP(['400', '500']);

  const allFonts = [...interFonts, ...notoFonts];
  log(`Downloaded ${allFonts.length} .ttf font files`);

  let added = 0;
  let errors = 0;

  for (const font of allFonts) {
    if (DRY_RUN) {
      logDry(`Would add font: ${font.filename} → Foundations/Typography`);
      added++;
      continue;
    }

    try {
      const weightLabel =
        font.weight === '400' ? 'Regular' : font.weight === '500' ? 'Medium' : `w${font.weight}`;

      const annotation = [
        `family: ${font.family}`,
        `weight: ${font.weight} (${weightLabel})`,
        `format: TrueType (.ttf)`,
        `usage: ${font.family === 'Inter' ? '--font-inter (英語)' : '--font-noto-jp (日本語)'}`,
        `source: Google Fonts via next/font`,
        `config: src/app/layout.tsx`,
      ].join('\n');

      await addItemToEagle({
        filePath: font.path,
        name: `${font.family} ${weightLabel}`,
        tags: [
          'foundations',
          'typography',
          'font',
          font.family.toLowerCase().replace(/\s+/g, '-'),
          `weight-${font.weight}`,
        ],
        folderId: typoFolderId,
        annotation,
        star: 5,
      });

      log(`🔤 Added: ${font.family} ${weightLabel} (.ttf)`);
      added++;
    } catch (e) {
      log(`❌ Error: ${font.filename}: ${(e as Error).message}`);
      errors++;
    }
  }

  return { added, errors };
}

// ═════════════════════════════════════════════════════════
// Icons (Lucide → SVG)
// ═════════════════════════════════════════════════════════

/** PascalCase → kebab-case (Lucide naming: letters-before-digits get a hyphen) */
function toKebabCase(str: string): string {
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .replace(/([a-zA-Z])(\d)/g, '$1-$2') // e.g. Loader2 → Loader-2
    .toLowerCase();
}

/** プロジェクトで使用中の Lucide アイコン名を収集（PascalCase） */
function collectUsedIcons(): string[] {
  const srcDir = path.join(ROOT, 'src');
  const iconSet = new Set<string>();

  function scanDir(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.next') continue;
        scanDir(path.join(dir, entry.name));
      } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
        const content = fs.readFileSync(path.join(dir, entry.name), 'utf-8');
        // Match: import { X, Y, Z } from 'lucide-react'
        const importMatches = content.matchAll(
          /import\s*\{([^}]+)\}\s*from\s*['"]lucide-react['"]/g,
        );
        for (const m of importMatches) {
          const names = m[1].split(',').map((s) =>
            s
              .trim()
              .split(/\s+as\s+/)[0]
              .trim(),
          );
          for (const name of names) {
            // Skip non-icon exports (type, createLucideIcon, LucideIcon etc.)
            if (
              name &&
              /^[A-Z]/.test(name) &&
              name !== 'LucideIcon' &&
              !name.startsWith('Lucide') &&
              !name.includes('Props')
            ) {
              iconSet.add(name);
            }
          }
        }
      }
    }
  }

  scanDir(srcDir);
  return [...iconSet].sort();
}

/**
 * lucide-react の JS ファイルからアイコンの SVG パスデータを読み取り SVG を生成
 * 再エクスポート（alias）の場合は実体ファイルを追跡する
 */
function buildIconSvg(iconName: string): string | null {
  const iconsDir = path.join(ROOT, 'node_modules/lucide-react/dist/esm/icons');

  // Try exact kebab-case first
  const kebab = toKebabCase(iconName);
  const result = resolveIconSvg(kebab, iconsDir, 0);
  if (result) return result;

  // Try stripping "Icon" suffix (e.g. CheckIcon → check, SearchIcon → search)
  if (iconName.endsWith('Icon') && iconName.length > 4) {
    const stripped = toKebabCase(iconName.slice(0, -4));
    return resolveIconSvg(stripped, iconsDir, 0);
  }

  return null;
}

function resolveIconSvg(kebab: string, iconsDir: string, depth: number): string | null {
  if (depth > 3) return null;

  const jsPath = path.join(iconsDir, `${kebab}.js`);
  if (!fs.existsSync(jsPath)) return null;

  const js = fs.readFileSync(jsPath, 'utf-8');

  // Check for re-export: export { default } from './other-name.js'
  const reExportMatch = js.match(/export\s*\{\s*default\s*\}\s*from\s*['"]\.\/([^'"]+)\.js['"]/);
  if (reExportMatch) {
    return resolveIconSvg(reExportMatch[1], iconsDir, depth + 1);
  }

  // Parse __iconNode array: [["tag", { attrs }], ...]
  const nodeMatch = js.match(/const\s+__iconNode\s*=\s*(\[[\s\S]*?\]);/);
  if (!nodeMatch) return null;

  let iconNode: Array<[string, Record<string, string>]>;
  try {
    iconNode = new Function(`return ${nodeMatch[1]}`)() as Array<[string, Record<string, string>]>;
  } catch {
    return null;
  }

  const elements = iconNode
    .map(([tag, attrs]) => {
      const attrStr = Object.entries(attrs)
        .filter(([k]) => k !== 'key')
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ');
      return `<${tag} ${attrStr}/>`;
    })
    .join('\n  ');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  ${elements}
</svg>`;
}

async function importIcons(
  iconsFolderId: string,
): Promise<{ added: number; skipped: number; errors: number }> {
  const usedIcons = collectUsedIcons();
  log(`Found ${usedIcons.length} unique Lucide icons in use`);

  let added = 0;
  let skipped = 0;
  let errors = 0;

  for (const iconName of usedIcons) {
    const svg = buildIconSvg(iconName);
    if (!svg) {
      log(`⏭️  Skip (no SVG data): ${iconName}`);
      skipped++;
      continue;
    }

    const kebab = toKebabCase(iconName);
    const svgPath = path.join(TMP_DIR, `icon-${kebab}.svg`);

    if (DRY_RUN) {
      logDry(`Would add icon: ${iconName} → Foundations/Icons`);
      added++;
      continue;
    }

    try {
      // Save SVG file (Eagle supports SVG natively)
      fs.writeFileSync(svgPath, svg);

      const annotation = [
        `icon: ${iconName}`,
        `library: lucide-react`,
        `import: import { ${iconName} } from 'lucide-react'`,
        `kebab: ${kebab}`,
      ].join('\n');

      await addItemToEagle({
        filePath: svgPath,
        name: iconName,
        tags: ['foundations', 'icon', 'lucide', kebab],
        folderId: iconsFolderId,
        annotation,
        star: 5,
      });

      log(`🔣 Added: ${iconName}`);
      added++;
    } catch (e) {
      log(`❌ Error: ${iconName}: ${(e as Error).message}`);
      errors++;
    }
  }

  return { added, skipped, errors };
}

// ═════════════════════════════════════════════════════════
// Main
// ═════════════════════════════════════════════════════════

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  eagle-foundations: Design Tokens → Eagle');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (DRY_RUN) console.log('  ⚠️  DRY RUN モード（変更なし）');
  console.log();

  // 1. Eagle 接続確認
  log('Connecting to Eagle...');
  const connected = await checkConnection();
  if (!connected) {
    console.error('❌ Eagle に接続できません。Eagle アプリが起動しているか確認してください。');
    process.exit(1);
  }
  log('✅ Eagle connected.');

  // 2. tmp ディレクトリ準備
  fs.mkdirSync(TMP_DIR, { recursive: true });

  // 3. フォルダ構造
  log('Setting up folders...');
  const folders = await getFolderList();
  const folderMap = new Map<string, string>();

  const foundationsId = await ensureFolderPath('Foundations', folders, folderMap);
  const colorsFolderId = runColors
    ? await ensureFolderPath('Foundations/Colors', folders, folderMap)
    : '';
  const typoFolderId = runFonts
    ? await ensureFolderPath('Foundations/Typography', folders, folderMap)
    : '';
  const iconsFolderId = runIcons
    ? await ensureFolderPath('Foundations/Icons', folders, folderMap)
    : '';

  log(`✅ Folders ready. (Foundations: ${foundationsId})`);

  // 4. Colors
  let colorResult = { added: 0, skipped: 0, errors: 0 };
  if (runColors) {
    log('');
    log('── Colors ──────────────────────────────');
    colorResult = await importColors(colorsFolderId);
  }

  // 5. Fonts
  let fontResult = { added: 0, errors: 0 };
  if (runFonts) {
    log('');
    log('── Typography ──────────────────────────');
    fontResult = await importFonts(typoFolderId);
  }

  // 6. Icons
  let iconResult = { added: 0, skipped: 0, errors: 0 };
  if (runIcons) {
    log('');
    log('── Icons ───────────────────────────────');
    iconResult = await importIcons(iconsFolderId);
  }

  // 7. Cleanup
  if (!DRY_RUN) {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  }

  // 8. Report
  console.log();
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  📊 Foundations Report');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (runColors) {
    console.log(
      `  🎨 Colors:  ${colorResult.added} added, ${colorResult.skipped} skipped, ${colorResult.errors} errors`,
    );
  }
  if (runFonts) {
    console.log(`  🔤 Fonts:   ${fontResult.added} added, ${fontResult.errors} errors`);
  }
  if (runIcons) {
    console.log(
      `  🔣 Icons:   ${iconResult.added} added, ${iconResult.skipped} skipped, ${iconResult.errors} errors`,
    );
  }
  console.log();

  const totalErrors = colorResult.errors + fontResult.errors + iconResult.errors;
  if (totalErrors > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
