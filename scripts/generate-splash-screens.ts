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

import { generateSplashScreens, SPLASH_SIZES } from './lib/pwa-splash';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT, 'public', 'splash');
const ICON_PATH = path.join(ROOT, 'public', 'icons', 'icon-512.png');

// テーマカラー（manifest.json の background_color と一致）
const BG_COLOR = { r: 255, g: 255, b: 255 };

async function main() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic import for optional dep
  const sharp = (await import('sharp')).default;
  const fs = await import('node:fs/promises');

  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // アイコン画像を読み込み
  const iconBuffer = await fs.readFile(ICON_PATH);

  await generateSplashScreens({
    sharp,
    iconBuffer,
    bgColor: BG_COLOR,
    outputDir: OUTPUT_DIR,
    root: ROOT,
    // eslint-disable-next-line no-console -- スクリプト用
    log: (message) => console.log(message),
  });

  // eslint-disable-next-line no-console -- スクリプト用
  console.log(`\n${SPLASH_SIZES.length} splash screens generated in public/splash/`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console -- スクリプト用
  console.error('Failed to generate splash screens:', err);
  process.exit(1);
});
