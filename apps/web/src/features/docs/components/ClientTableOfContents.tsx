'use client';

import { AutoTableOfContents } from './AutoTableOfContents';

interface ClientTableOfContentsProps {
  content?: string;
  /** 下部の Links を内包表示するか（blog は別 card にするため false）。 */
  showLinks?: boolean;
}

export function ClientTableOfContents({ content, showLinks = true }: ClientTableOfContentsProps) {
  if (!content) {
    return null;
  }

  return <AutoTableOfContents content={content} showLinks={showLinks} />;
}
