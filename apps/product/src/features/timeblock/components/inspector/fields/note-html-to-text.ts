const HTML_ENTITIES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#039;': "'",
  '&#39;': "'",
  '&nbsp;': ' ',
} as const;

function readTagName(rawTag: string): { name: string; isClosing: boolean } {
  let index = 0;
  while (rawTag[index] === ' ') index += 1;

  const isClosing = rawTag[index] === '/';
  if (isClosing) index += 1;
  while (rawTag[index] === ' ') index += 1;

  const start = index;
  while (index < rawTag.length) {
    const char = rawTag[index];
    if (char === undefined || !/[a-z0-9]/i.test(char)) break;
    index += 1;
  }

  return {
    name: rawTag.slice(start, index).toLowerCase(),
    isClosing,
  };
}

function findFollowingParagraphStart(value: string, start: number): number | null {
  let index = start;
  while (/\s/.test(value[index] ?? '')) index += 1;
  if (value[index] !== '<') return null;

  const tagEnd = value.indexOf('>', index + 1);
  if (tagEnd === -1) return null;
  const tag = readTagName(value.slice(index + 1, tagEnd));
  return !tag.isClosing && tag.name === 'p' ? index : null;
}

function readEntity(value: string, start: number): { decoded: string; end: number } | null {
  const entityEnd = value.indexOf(';', start + 1);
  if (entityEnd === -1 || entityEnd - start > 7) return null;

  const entity = value.slice(start, entityEnd + 1);
  const decoded = HTML_ENTITIES[entity as keyof typeof HTML_ENTITIES];
  return decoded === undefined ? null : { decoded, end: entityEnd + 1 };
}

/** 旧リッチテキスト形式のメモを、一度だけ復号した平文へ変換する。 */
export function convertNoteHtmlToText(value: string): string {
  let text = '';
  let index = 0;

  while (index < value.length) {
    const char = value[index];

    if (char === '<') {
      const tagEnd = value.indexOf('>', index + 1);
      if (tagEnd !== -1) {
        const tag = readTagName(value.slice(index + 1, tagEnd));
        if (!tag.isClosing && tag.name === 'br') {
          text += '\n';
        } else if (tag.isClosing && tag.name === 'p') {
          const nextParagraph = findFollowingParagraphStart(value, tagEnd + 1);
          if (nextParagraph !== null) {
            text += '\n';
            index = nextParagraph;
            continue;
          }
        }
        index = tagEnd + 1;
        continue;
      }
    }

    if (char === '&') {
      const entity = readEntity(value, index);
      if (entity !== null) {
        text += entity.decoded;
        index = entity.end;
        continue;
      }
    }

    text += char;
    index += 1;
  }

  return text.trim();
}
