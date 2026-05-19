import mermaid from 'mermaid';
import { useEffect, useRef, useState } from 'react';

/** Storybook MDX内でMermaid図をレンダリングするコンポーネント */
export function Mermaid({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState('');

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'neutral',
      securityLevel: 'loose',
    });

    const id = `mermaid-${Math.random().toString(36).slice(2, 9)}`;
    mermaid.render(id, chart).then(({ svg: renderedSvg }) => {
      setSvg(renderedSvg);
    });
  }, [chart]);

  return <div ref={ref} dangerouslySetInnerHTML={{ __html: svg }} />;
}
