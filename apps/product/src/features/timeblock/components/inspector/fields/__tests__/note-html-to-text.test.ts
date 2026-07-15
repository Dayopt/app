import { describe, expect, it } from 'vitest';

import { convertNoteHtmlToText } from '../note-html-to-text';

describe('convertNoteHtmlToText', () => {
  it('平文は前後の空白だけを除いて維持する', () => {
    expect(convertNoteHtmlToText('  会議メモ\n次の行  ')).toBe('会議メモ\n次の行');
  });

  it('旧HTMLの改行・段落・文字参照を平文へ変換する', () => {
    expect(
      convertNoteHtmlToText(
        '<p>first &amp; second<br>next</p>  <p>&lt;literal&gt; &quot;quote&quot; &#039;memo&#39;&nbsp;</p>',
      ),
    ).toBe('first & second\nnext\n<literal> "quote" \'memo\'');
  });

  it('二重エンコードされた文字参照を一度だけ復号する', () => {
    expect(convertNoteHtmlToText('&amp;lt;script&amp;gt;alert(1)&amp;lt;/script&amp;gt;')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );
  });

  it('HTMLタグを除去して内容だけを返す', () => {
    expect(convertNoteHtmlToText('<script>alert(1)</script><img src=x onerror=alert(2)>memo')).toBe(
      'alert(1)memo',
    );
  });

  it('未対応の文字参照と閉じていないタグ風テキストは維持する', () => {
    expect(convertNoteHtmlToText('value &unknown; less <script')).toBe(
      'value &unknown; less <script',
    );
  });
});
