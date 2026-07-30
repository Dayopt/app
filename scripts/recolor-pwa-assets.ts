/**
 * PWA アセット再着色スクリプト
 *
 * アイコン:  黒背景の原本 → primary blue (#23467f) に差し替え、白シンボル維持
 * Maskable:  safe zone (80%) 内にシンボルを配置した版を新規作成
 * Splash:   再着色後アイコンと背景色から再生成
 *
 * 使用方法:
 *   npx tsx scripts/recolor-pwa-assets.ts
 *
 * 依存: sharp
 *
 * ── 入力は必ず原本（黒背景）である必要がある ──
 *
 * recolorIcon は「輝度 0 = primary、輝度 255 = 白」の線形ブレンドなので、
 * 既に着色済みの画像を入力にすると二重に変換されて色が褪せる。
 * 例: #2051a1（輝度 75.5）を再入力すると #647da5 になり、primary に戻らない。
 *
 * そのため原本は public/ ではなく apps/product/assets/pwa-icons/ に置き、
 * 出力先の public/icons/ とは分離する。原本は書き換えないので、このスクリプトは
 * 何度実行しても同じ結果になる。ブランドカラーを変えたら PRIMARY を更新して
 * 再実行するだけでよい。
 *
 * 過去に出力先を入力として扱っていたため、maskable アイコンが劣化していた。
 * createMaskableIcon の白シンボル抽出（alpha = 輝度）は黒背景を前提とするが、
 * 着色済み（青地・輝度 66-75）を入力すると背景が alpha 26-30% の白になり、
 * 面全体が色褪せた水色（#6184bc）になっていた。
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateSplashScreens } from './lib/pwa-splash';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PRODUCT_DIR = path.join(ROOT, 'apps', 'product');
const PRODUCT_PUBLIC_DIR = path.join(PRODUCT_DIR, 'public');
/** 黒背景の原本（入力・書き換えない） */
const SOURCE_ICONS_DIR = path.join(PRODUCT_DIR, 'assets', 'pwa-icons');
const ICONS_DIR = path.join(PRODUCT_PUBLIC_DIR, 'icons');
const SPLASH_DIR = path.join(PRODUCT_PUBLIC_DIR, 'splash');

// Primary blue: oklch(0.4 0.105 259.8145) → #23467f
const PRIMARY = { r: 35, g: 70, b: 127 };

// bg-background light: oklch(0.97 0.005 75) → #f7f5f1
const BG_COLOR = { r: 247, g: 245, b: 241 };

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
 *
 * sourceIconPath には**黒背景の原本**を渡す。白シンボルの抽出に
 * alpha = 輝度 を使うため、着色済みを渡すと背景が透明にならず面が濁る。
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
    // 入力は原本（黒背景）、出力は public/icons/。原本は書き換えない
    await recolorIcon(sharp, path.join(SOURCE_ICONS_DIR, file), path.join(ICONS_DIR, file));
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
    // 白シンボルの抽出には黒背景が必要なので、原本を入力にする
    await createMaskableIcon(
      sharp,
      path.join(SOURCE_ICONS_DIR, source),
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
