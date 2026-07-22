/** Markdown table のセル内容を、表示文字を保ったまま安全に埋め込める形へ変換する。 */
export function escapeMarkdownTableCell(value: string): string {
  return (
    value
      .replace(/\s+/g, ' ')
      // 既存の backslash を先に escape し、後段で追加する pipe escape を壊さない。
      .replace(/\\/g, '\\\\')
      .replace(/\|/g, '\\|')
      .trim() || '—'
  );
}
