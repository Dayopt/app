/**
 * Storybook Docs カスタムテンプレート
 *
 * @tailwindcss/typography の prose クラスでタイポグラフィを適用。
 * Storybook固有の上書きは storybook-overrides.css で対応。
 */
import {
  Controls,
  Description,
  Primary,
  Stories,
  Subtitle,
  Title,
} from '@storybook/addon-docs/blocks';

export function DocsTemplate() {
  return (
    <div className="prose dark:prose-invert mx-auto max-w-4xl">
      <Title />
      <Subtitle />
      <Description />
      <Primary />
      <Controls />
      <Stories includePrimary={false} />
    </div>
  );
}
