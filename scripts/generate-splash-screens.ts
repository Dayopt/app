/**
 * iOS PWA スプラッシュスクリーン生成スクリプト
 *
 * public/icons/icon-512.png をベースに各デバイスサイズの
 * スプラッシュスクリーン画像を生成する。
 *
 * 使用方法:
 *   npx tsx scripts/generate-splash-screens.ts
 *
 * 依存: sharp（画像処理）
 *   npm install -D sharp
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT, 'public', 'splash');
const ICON_PATH = path.join(ROOT, 'public', 'icons', 'icon-512.png');

// layout.tsx の apple-touch-startup-image で参照されるサイズ一覧
const SPLASH_SIZES = [
  { width: 1290, height: 2796, label: 'iPhone 16 Pro Max / 15 Pro Max' },
  { width: 1179, height: 2556, label: 'iPhone 16 Pro / 15 Pro / 14 Pro' },
  { width: 1170, height: 2532, label: 'iPhone 14 / 13 / 12' },
  { width: 750, height: 1334, label: 'iPhone SE / 8' },
  { width: 2048, height: 2732, label: 'iPad Pro 12.9"' },
  { width: 1668, height: 2388, label: 'iPad Pro 11"' },
  { width: 1640, height: 2360, label: 'iPad Air / mini 6th+' },
  { width: 1536, height: 2048, label: 'iPad 9th gen' },
];

// テーマカラー（manifest.json の background_color と一致）
const BG_COLOR = { r: 255, g: 255, b: 255 };

async function main() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic import for optional dep
  const sharp = (await import('sharp')).default;
  const fs = await import('node:fs/promises');

  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // アイコン画像を読み込み
  const iconBuffer = await fs.readFile(ICON_PATH);
  const iconMeta = await sharp(iconBuffer).metadata();
  const iconSize = Math.min(iconMeta.width ?? 512, iconMeta.height ?? 512);

  for (const size of SPLASH_SIZES) {
    const outputPath = path.join(OUTPUT_DIR, `splash-${size.width}x${size.height}.png`);

    // アイコンをスプラッシュ画像の中央に配置（画面短辺の25%サイズ）
    const logoSize = Math.round(Math.min(size.width, size.height) * 0.25);
    const resizedIcon = await sharp(iconBuffer)
      .resize(logoSize, logoSize, { fit: 'contain', background: { ...BG_COLOR, alpha: 0 } })
      .toBuffer();

    // 白背景にアイコンを中央配置
    await sharp({
      create: {
        width: size.width,
        height: size.height,
        channels: 3,
        background: BG_COLOR,
      },
    })
      .composite([
        {
          input: resizedIcon,
          gravity: 'centre',
        },
      ])
      .png()
      .toFile(outputPath);

    // eslint-disable-next-line no-console -- スクリプト用
    console.log(
      `✓ ${size.width}x${size.height} → ${path.relative(ROOT, outputPath)} (${size.label})`,
    );
  }

  // eslint-disable-next-line no-console -- スクリプト用
  console.log(`\n${SPLASH_SIZES.length} splash screens generated in public/splash/`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console -- スクリプト用
  console.error('Failed to generate splash screens:', err);
  process.exit(1);
});
