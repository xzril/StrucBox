import katex from 'katex';
import { useMemo } from 'react';

export function Tex({ tex, block }: { tex: string; block?: boolean }) {
  // block uses inline mode + \displaystyle so long equations wrap at = and + instead of clipping in the narrow panel
  const html = useMemo(() => katex.renderToString(block ? `\\displaystyle ${tex}` : tex, { throwOnError: false }), [tex, block]);
  return <span className={block ? 'tex-block' : 'tex'} dangerouslySetInnerHTML={{ __html: html }} />;
}
