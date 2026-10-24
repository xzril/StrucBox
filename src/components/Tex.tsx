import katex from 'katex';
import { useMemo } from 'react';

export function Tex({ tex, block }: { tex: string; block?: boolean }) {
  const html = useMemo(() => katex.renderToString(tex, { throwOnError: false, displayMode: !!block }), [tex, block]);
  return <span className={block ? 'tex-block' : 'tex'} dangerouslySetInnerHTML={{ __html: html }} />;
}
