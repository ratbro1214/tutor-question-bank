import katex from "katex";
import { normalizeMathCommands, splitMathText } from "@/lib/math-text";

export function MathText({ children, className = "" }: { children: string; className?: string }) {
  // Only the curated local corpus can embed images. External URLs and arbitrary
  // Markdown stay plain text, preserving the existing untrusted-text boundary.
  const figurePattern = /!\[([^\]\n]{0,80})\]\((\/gaokao\/assets\/[A-Za-z0-9_./-]+\.png)\)/g;
  const figures = [...children.matchAll(figurePattern)].filter(match => !match[2].split('/').includes('..'));
  if (figures.length) {
    const elements = []; let offset = 0;
    for (const [index,match] of figures.entries()) {
      if (match.index! > offset) elements.push(<MathText key={'text-'+index}>{children.slice(offset,match.index)}</MathText>);
      elements.push(<img key={'figure-'+index} loading="lazy" src={match[2]} alt={match[1] || '题图'} className="my-3 max-h-96 max-w-full object-contain" />);
      offset = match.index! + match[0].length;
    }
    if (offset < children.length) elements.push(<MathText key="tail">{children.slice(offset)}</MathText>);
    return <div className={className}>{elements}</div>;
  }
  const parts = splitMathText(children);
  return <div className={`math-text whitespace-pre-wrap break-words ${className}`}>{parts.map((part, index) => {
    if (part.kind === "text") {
      let text = part.displayText ?? part.source;
      if (parts[index - 1]?.display) text = text.replace(/^[ \t]*\r?\n/, "");
      if (parts[index + 1]?.display) text = text.replace(/\r?\n[ \t]*$/, "");
      return <span key={index}>{text}</span>;
    }
    try {
      const html = katex.renderToString(normalizeMathCommands(part.tex!), { displayMode: part.display, throwOnError: true, trust: false, strict: "error", output: "htmlAndMathml", maxExpand: 500, maxSize: 10 });
      return <span key={index} className={part.display ? "math-block" : "math-inline"} dangerouslySetInnerHTML={{ __html: html }} />;
    } catch {
      return <span key={index} className="math-fallback" title="公式暂时无法排版，已保留原文">{part.source}</span>;
    }
  })}</div>;
}
