'use client';

import { AutoTableOfContents } from './AutoTableOfContents';

interface ClientTableOfContentsProps {
  content?: string;
}

export function ClientTableOfContents({ content }: ClientTableOfContentsProps) {
  if (!content) {
    return null;
  }

  return <AutoTableOfContents content={content} />;
}
