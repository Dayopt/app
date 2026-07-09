/**
 * iOS PWA スプラッシュスクリーン生成ロジック
 *
 * scripts/generate-splash-screens.ts と scripts/recolor-pwa-assets.ts が
 * 共有する。layout.tsx の apple-touch-startup-image で参照されるサイズ一覧と
 * 生成ロジックを一箇所に集約する。
 */

import path from 'node:path';

export const SPLASH_SIZES = [
  { width: 1290, height: 2796, label: 'iPhone 16 Pro Max / 15 Pro Max' },
  { width: 1179, height: 2556, label: 'iPhone 16 Pro / 15 Pro / 14 Pro' },
  { width: 1170, height: 2532, label: 'iPhone 14 / 13 / 12' },
  { width: 750, height: 1334, label: 'iPhone SE / 8' },
  { width: 2048, height: 2732, label: 'iPad Pro 12.9"' },
  { width: 1668, height: 2388, label: 'iPad Pro 11"' },
  { width: 1640, height: 2360, label: 'iPad Air / mini 6th+' },
  { width: 1536, height: 2048, label: 'iPad 9th gen' },
];

export async function generateSplashScreens(options: {
  sharp: typeof import('sharp').default;
  iconBuffer: Buffer;
  bgColor: { r: number; g: number; b: number };
  outputDir: string;
  root: string;
  log: (message: string) => void;
}): Promise<void> {
  const { sharp, iconBuffer, bgColor, outputDir, root, log } = options;

  for (const size of SPLASH_SIZES) {
    const outputPath = path.join(outputDir, `splash-${size.width}x${size.height}.png`);

    // アイコンをスプラッシュ画像の中央に配置（画面短辺の25%サイズ）
    const logoSize = Math.round(Math.min(size.width, size.height) * 0.25);
    const resizedIcon = await sharp(iconBuffer)
      .resize(logoSize, logoSize, { fit: 'contain', background: { ...bgColor, alpha: 0 } })
      .toBuffer();

    await sharp({
      create: {
        width: size.width,
        height: size.height,
        channels: 3,
        background: bgColor,
      },
    })
      .composite([{ input: resizedIcon, gravity: 'centre' }])
      .png()
      .toFile(outputPath);

    log(`✓ ${size.width}x${size.height} → ${path.relative(root, outputPath)} (${size.label})`);
  }
}
