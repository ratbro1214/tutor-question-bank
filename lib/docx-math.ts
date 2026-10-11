import katex from 'katex';
import { normalizeMathCommands } from './math-text';

export const docxXml = (value: unknown) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
type Node = { tag: string; attributes: Record<string, string>; children: (Node | string)[] };
const decode = (s: string) => s.replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
function parseMathML(xml: string) {
  const root: Node = { tag: 'root', attributes: {}, children: [] }, stack = [root];
  for (const token of xml.match(/<[^>]+>|[^<]+/g) || []) {
    if (token.startsWith('</')) { if (stack.at(-1)?.tag !== token.slice(2, -1)) throw Error('公式结构不完整。'); stack.pop(); }
    else if (token.startsWith('<')) {
      const tag = token.match(/^<([\w-]+)/)?.[1]; if (!tag) throw Error('公式节点无效。');
      const attributes: Record<string, string> = {};
      for (const a of token.matchAll(/([\w:-]+)="([^"]*)"/g)) attributes[a[1]] = decode(a[2]);
      const node: Node = { tag, attributes, children: [] }; stack.at(-1)!.children.push(node); if (!token.endsWith('/>')) stack.push(node);
    } else stack.at(-1)!.children.push(decode(token));
  }
  if (stack.length !== 1) throw Error('公式结构不完整。'); return root;
}
const textOf = (n: Node | string): string => typeof n === 'string' ? n : n.children.map(textOf).join('');
function convert(n: Node | string): string {
  if (typeof n === 'string') return n.trim() ? `<m:r><m:t xml:space="preserve">${docxXml(n)}</m:t></m:r>` : '';
  const nodes = n.children.filter((c): c is Node => typeof c !== 'string'), all = () => n.children.map(convert).join(''), child = (i: number) => nodes[i] ? convert(nodes[i]) : '';
  switch (n.tag) {
    case 'annotation': return '';
    case 'root': case 'math': case 'semantics': case 'mrow': case 'mstyle': case 'mpadded': return all();
    case 'mi': case 'mn': case 'mo': case 'mtext': case 'ms': {
      const plain = n.tag !== 'mi' || n.attributes.mathvariant === 'normal';
      return `<m:r><m:rPr><m:sty m:val="${n.attributes.mathvariant?.includes('bold') ? 'b' : plain ? 'p' : 'i'}"/></m:rPr><w:rPr><w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math" w:eastAsia="宋体"/></w:rPr><m:t xml:space="preserve">${docxXml(textOf(n))}</m:t></m:r>`;
    }
    case 'mspace': return '<m:r><m:t xml:space="preserve"> </m:t></m:r>';
    case 'mfrac': return `<m:f><m:fPr><m:type m:val="${n.attributes.linethickness === '0px' ? 'noBar' : 'bar'}"/></m:fPr><m:num>${child(0)}</m:num><m:den>${child(1)}</m:den></m:f>`;
    case 'msup': return `<m:sSup><m:e>${child(0)}</m:e><m:sup>${child(1)}</m:sup></m:sSup>`;
    case 'msub': return `<m:sSub><m:e>${child(0)}</m:e><m:sub>${child(1)}</m:sub></m:sSub>`;
    case 'msubsup': return `<m:sSubSup><m:e>${child(0)}</m:e><m:sub>${child(1)}</m:sub><m:sup>${child(2)}</m:sup></m:sSubSup>`;
    case 'msqrt': return `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>${all()}</m:e></m:rad>`;
    case 'mroot': return `<m:rad><m:deg>${child(1)}</m:deg><m:e>${child(0)}</m:e></m:rad>`;
    case 'mover': {
      const accent = textOf(nodes[1] || '');
      if (/^[¯‾]$/.test(accent)) return `<m:bar><m:barPr><m:pos m:val="top"/></m:barPr><m:e>${child(0)}</m:e></m:bar>`;
      if (n.attributes.accent === 'true') return `<m:acc><m:accPr><m:chr m:val="${docxXml(accent)}"/></m:accPr><m:e>${child(0)}</m:e></m:acc>`;
      return `<m:limUpp><m:e>${child(0)}</m:e><m:lim>${child(1)}</m:lim></m:limUpp>`;
    }
    case 'munder': return `<m:limLow><m:e>${child(0)}</m:e><m:lim>${child(1)}</m:lim></m:limLow>`;
    case 'munderover': return `<m:limUpp><m:e><m:limLow><m:e>${child(0)}</m:e><m:lim>${child(1)}</m:lim></m:limLow></m:e><m:lim>${child(2)}</m:lim></m:limUpp>`;
    case 'mtable': return `<m:m><m:mPr><m:baseJc m:val="center"/></m:mPr>${all()}</m:m>`;
    case 'mtr': return `<m:mr>${all()}</m:mr>`;
    case 'mtd': return `<m:e>${all()}</m:e>`;
    default: throw Error(`Word 公式暂不支持 ${n.tag}，请调整该公式后导出。`);
  }
}
export function texToWordMath(tex: string, display: boolean) {
  try {
    const rendered = katex.renderToString(normalizeMathCommands(tex), { output: 'mathml', displayMode: display, throwOnError: true, trust: false, strict: 'error', maxExpand: 500, maxSize: 10 });
    const xml = rendered.match(/<math[\s\S]*<\/math>/)?.[0]; if (!xml) throw Error('没有可用公式。');
    return `<m:oMath>${convert(parseMathML(xml))}</m:oMath>`;
  } catch (e) { throw Error(`数学公式无法导出，请修正后重试：${tex.slice(0, 80)}。${e instanceof Error ? e.message : ''}`); }
}
