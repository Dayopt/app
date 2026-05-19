import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 読了時間を計算する
 * 日本語コンテンツは文字数ベース、英語コンテンツは単語数ベースで計算
 * @param content - コンテンツ文字列
 * @param options - オプション設定
 * @returns 読了時間（分）
 */
export function calculateReadingTime(
  content: string,
  options: {
    wordsPerMinute?: number;
    charsPerMinute?: number;
  } = {},
): number {
  const { wordsPerMinute = 200, charsPerMinute = 500 } = options;

  // 日本語文字が含まれているかチェック
  const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(content);

  if (hasJapanese) {
    // 日本語: 文字数ベース（約500文字/分）
    const charCount = content.replace(/\s+/g, '').length;
    return Math.max(1, Math.ceil(charCount / charsPerMinute));
  } else {
    // 英語: 単語数ベース（約200単語/分）
    const wordCount = content.split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.ceil(wordCount / wordsPerMinute));
  }
}
