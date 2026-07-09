/**
 * PWA アセット再着色スクリプト
 *
 * アイコン:  黒背景 → primary blue (#2051a1) に差し替え、白シンボル維持
 * Maskable:  safe zone (80%) 内にシンボルを配置した版を新規作成
 * Splash:   既存スクリプトと同じロジックで再生成（再着色後アイコンを使用）
 *
 * 使用方法:
 *   npx tsx scripts/recolor-pwa-assets.ts
 *
 * 依存: sharp
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateSplashScreens } from './lib/pwa-splash';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PRODUCT_PUBLIC_DIR = path.join(ROOT, 'apps', 'product', 'public');
const ICONS_DIR = path.join(PRODUCT_PUBLIC_DIR, 'icons');
const SPLASH_DIR = path.join(PRODUCT_PUBLIC_DIR, 'splash');

// Primary blue: oklch(0.45 0.14 259.8145) → #2051a1
const PRIMARY = { r: 32, g: 81, b: 161 };

// bg-background light: oklch(0.98 0 0) → #f8f8f8
const BG_COLOR = { r: 248, g: 248, b: 248 };

/**
 * 画像の暗い部分を primary blue に差し替え、白い部分は維持
 * 黒→blue、白→白、グレー（アンチエイリアス）→blueと白のブレンド
 */
async function recolorIcon(
  sharp: typeof import('sharp').default,
  inputPath: string,
  outputPath: string,
) {
  const image = sharp(inputPath).ensureAlpha();
  const { width, height } = await image.metadata();
  if (!width || !height) throw new Error(`Cannot read metadata: ${inputPath}`);

  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const pixels = Buffer.from(data);

  for (let i = 0; i < info.width * info.height; i++) {
    const offset = i * 4;
    const r = pixels[offset]!;
    const g = pixels[offset + 1]!;
    const b = pixels[offset + 2]!;
    // alpha は保持

    // luminance (0-255): 0=黒, 255=白
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;

    // 黒→primary blue, 白→白, アンチエイリアスはブレンド
    const t = lum / 255;
    pixels[offset] = Math.round(PRIMARY.r * (1 - t) + 255 * t);
    pixels[offset + 1] = Math.round(PRIMARY.g * (1 - t) + 255 * t);
    pixels[offset + 2] = Math.round(PRIMARY.b * (1 - t) + 255 * t);
  }

  await sharp(pixels, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toFile(outputPath);
}

/**
 * Maskable icon 生成: safe zone (80%) 内にコンテンツを配置
 * 背景は primary blue ベタ塗り
 */
async function createMaskableIcon(
  sharp: typeof import('sharp').default,
  sourceIconPath: string,
  outputPath: string,
  size: number,
) {
  // ソースアイコンを読み込み
  const sourceBuffer = await sharp(sourceIconPath).toBuffer();

  // safe zone = 80% → アイコンを80%にリサイズ
  const innerSize = Math.round(size * 0.8);
  const resizedIcon = await sharp(sourceBuffer)
    .resize(innerSize, innerSize, { fit: 'contain', background: { ...PRIMARY, alpha: 0 } })
    .toBuffer();

  // 再着色: 黒→白にして、blue背景に白シンボルで合成
  const { data, info } = await sharp(resizedIcon)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels = Buffer.from(data);

  // 白シンボル部分だけ抽出（黒背景を透明にする）
  for (let i = 0; i < info.width * info.height; i++) {
    const offset = i * 4;
    const r = pixels[offset]!;
    const g = pixels[offset + 1]!;
    const b = pixels[offset + 2]!;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;

    // 白いシンボル → 白不透明, 黒背景 → 完全透明
    const alpha = Math.round(lum);
    pixels[offset] = 255;
    pixels[offset + 1] = 255;
    pixels[offset + 2] = 255;
    pixels[offset + 3] = alpha;
  }

  const whiteSymbol = await sharp(pixels, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();

  // Primary blue 背景にシンボルを中央合成
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { ...PRIMARY, alpha: 255 },
    },
  })
    .composite([{ input: whiteSymbol, gravity: 'centre' }])
    .png()
    .toFile(outputPath);
}

async function main() {
  const sharp = (await import('sharp')).default;
  const fs = await import('node:fs/promises');

  await fs.mkdir(ICONS_DIR, { recursive: true });
  await fs.mkdir(SPLASH_DIR, { recursive: true });

  // --- Step 1: アイコン再着色 ---
  // eslint-disable-next-line no-console -- スクリプト用
  console.log('=== Recoloring icons ===');

  const iconFiles = ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
  for (const file of iconFiles) {
    const inputPath = path.join(ICONS_DIR, file);
    // 元ファイルを直接上書き
    const tmpPath = path.join(ICONS_DIR, `_tmp_${file}`);
    await recolorIcon(sharp, inputPath, tmpPath);
    await fs.rename(tmpPath, inputPath);
    // eslint-disable-next-line no-console -- スクリプト用
    console.log(`✓ ${file} → primary blue`);
  }

  // --- Step 2: Maskable icon 生成 ---
  // eslint-disable-next-line no-console -- スクリプト用
  console.log('\n=== Generating maskable icons ===');

  const maskableSizes = [
    { size: 192, source: 'icon-192.png', output: 'icon-192-maskable.png' },
    { size: 512, source: 'icon-512.png', output: 'icon-512-maskable.png' },
  ];

  for (const { size, source, output } of maskableSizes) {
    // 元の（再着色前の）アイコン形状が必要 → 再着色済みから白シンボルを抽出
    await createMaskableIcon(
      sharp,
      path.join(ICONS_DIR, source),
      path.join(ICONS_DIR, output),
      size,
    );
    // eslint-disable-next-line no-console -- スクリプト用
    console.log(`✓ ${output} (${size}x${size})`);
  }

  // --- Step 3: スプラッシュ画像再生成 ---
  // eslint-disable-next-line no-console -- スクリプト用
  console.log('\n=== Regenerating splash screens ===');

  const iconBuffer = await fs.readFile(path.join(ICONS_DIR, 'icon-512.png'));

  await generateSplashScreens({
    sharp,
    iconBuffer,
    bgColor: BG_COLOR,
    outputDir: SPLASH_DIR,
    root: ROOT,
    // eslint-disable-next-line no-console -- スクリプト用
    log: (message) => console.log(message),
  });

  // eslint-disable-next-line no-console -- スクリプト用
  console.log('\n✅ All PWA assets updated successfully.');
}

main().catch((err) => {
  // eslint-disable-next-line no-console -- スクリプト用
  console.error('Failed to generate PWA assets:', err);
  process.exit(1);
});
