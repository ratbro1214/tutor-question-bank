import katex from "katex";
import { normalizeMathCommands, splitMathText } from "@/lib/math-text";

export function MathText({ children, className = "" }: { children: string; className?: string }) {
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
