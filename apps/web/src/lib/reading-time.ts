export function calculateReadingTime(
  content: string,
  options: {
    wordsPerMinute?: number;
    charsPerMinute?: number;
  } = {},
): number {
  const { wordsPerMinute = 200, charsPerMinute = 500 } = options;
  const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(content);

  if (hasJapanese) {
    const charCount = content.replace(/\s+/g, '').length;
    return Math.max(1, Math.ceil(charCount / charsPerMinute));
  }

  const wordCount = content.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(wordCount / wordsPerMinute));
}
