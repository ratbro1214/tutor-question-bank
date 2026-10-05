export type MathSegment = { kind: "text" | "math"; source: string; tex?: string; display?: boolean; displayText?: string };

// Some compatible gateways/models double-escape every TeX command. Repair only
// that uniform case for display; leave real matrix/aligned row breaks intact.
export function normalizeMathCommands(tex: string) {
  tex = tex.replace(/\\+u00(?:0[0-9a-f]|1[0-9a-f]|7f)/gi, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
  if (/\\\\[A-Za-z]/.test(tex) && !/(?<!\\)\\[A-Za-z]/.test(tex)) tex = tex.replace(/\\\\(?=[A-Za-z])/g, "\\");
  return tex.replace(/(?<!\\)\\\\(?=(?:begin|end)\{)/g, "\\");
}

const superscripts: Record<string, string> = Object.fromEntries([..."⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁽⁾ⁿ"].map((char, index) => [char, [..."0123456789+-()n"][index]]));
const subscripts: Record<string, string> = Object.fromEntries([..."₀₁₂₃₄₅₆₇₈₉"].map((char, index) => [char, String(index)]));
export function legacyMathToTex(source: string) {
  return source
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁽⁾ⁿ]+/g, value => `^{${[...value].map(c => superscripts[c]).join("")}}`)
    .replace(/[₀₁₂₃₄₅₆₇₈₉]+/g, value => `_{${[...value].map(c => subscripts[c]).join("")}}`)
    .replace(/−/g, "-").replace(/×/g, "\\times ").replace(/÷/g, "\\div ")
    .replace(/≤/g, "\\le ").replace(/≥/g, "\\ge ").replace(/≠/g, "\\ne ")
    .replace(/≈/g, "\\approx ").replace(/∞/g, "\\infty ").replace(/→/g, "\\to ")
    .replace(/\b(ln|log|sin|cos|tan|exp)\b/g, "\\$1 ")
    // Only unambiguous atomic fractions. Never invent grouping for old text.
    .replace(/(?<![\w}])([a-zA-Z]+|\d+)\/([a-zA-Z]+|\d+)(?![\w{])/g, "\\frac{$1}{$2}");
}
function legacySegments(text: string): MathSegment[] {
  const result: MathSegment[] = []; let cursor = 0;
  const runs = /[A-Za-z0-9α-ωΑ-Ω⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁽⁾ⁿ₀₁₂₃₄₅₆₇₈₉+\-−=<>≤≥≠≈×÷∞→^_/'′().|√∑\\{}&,\u007f]+(?:[ \t]+[A-Za-z0-9α-ωΑ-Ω⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁽⁾ⁿ₀₁₂₃₄₅₆₇₈₉+\-−=<>≤≥≠≈×÷∞→^_/'′().|√∑\\{}&,\u007f]+)*/g;
  for (const match of text.matchAll(runs)) {
    const source = match[0];
    if (/<\/?[A-Za-z]+\s/.test(source)) continue;
    if (!/[=<>≤≥≠≈^_⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ₀₁₂₃₄₅₆₇₈₉/α-ωΑ-Ω]/.test(source) && !/^[a-zA-Z]$/.test(source) && !/\\[A-Za-z]+/.test(source)) continue;
    if (match.index! > cursor) result.push({ kind: "text", source: text.slice(cursor, match.index) });
    result.push({ kind: "math", source, tex: /\\[A-Za-z]+/.test(source) ? source : legacyMathToTex(source), display: false }); cursor = match.index! + source.length;
  }
  if (cursor < text.length) result.push({ kind: "text", source: text.slice(cursor) });
  return result;
}
function hasProse(tex: string) {
  // Chinese inside \text{...} is intentional; bare Chinese is a broken boundary.
  const outsideText = tex.replace(/\\(?:text|textrm|textbf|textit|operatorname)\s*\{[^{}]*\}/g, "");
  return /\p{Script=Han}/u.test(outsideText);
}
function escaped(text: string, index: number) { return (text.slice(0, index).match(/\\+$/)?.[0].length || 0) % 2 !== 0; }
function dollars(text: string, start: number) {
  for (let index = start; index < text.length; index++) if (text[index] === "$" && !escaped(text, index)) return index;
  return -1;
}
export function splitMathText(text: string): MathSegment[] {
  const result: MathSegment[] = []; let cursor = 0, search = 0;
  // Environments can stand alone when a model omits/misplaces dollar markers.
  const openers = /\$\$?|\\+\[|\\+\(|\\+begin\{(aligned|alignedat|gathered|cases|matrix|pmatrix|bmatrix|vmatrix|Vmatrix|smallmatrix)\}/g;
  while (search < text.length) {
    openers.lastIndex = search;
    const match = openers.exec(text);
    if (!match) break;
    const start = match.index, opening = match[0].replace(/^\\+/, "\\");
    search = start + match[0].length;
    if (escaped(text, start)) continue;
    let end = -1, closingLength = 0, tex = "", display = opening !== "$" && opening !== "\\(";
    if (match[1]) {
      const closing = new RegExp(`\\\\+end\\{${match[1]}\\}`, "g"); closing.lastIndex = search;
      const closingMatch = closing.exec(text);
      end = closingMatch?.index ?? -1; closingLength = closingMatch?.[0].length ?? 0;
      if (end !== -1) tex = text.slice(start, end + closingLength);
    } else if (opening[0] === "$" ) {
      end = dollars(text, search);
      if (end !== -1) {
        // Accept a single-dollar closer for a malformed display block. Do not
        // consume a following opener or prose just to match marker lengths.
        closingLength = opening === "$$" && text[end + 1] === "$" ? 2 : 1;
        tex = text.slice(search, end);
      }
    } else {
      const closing = opening === "\\[" ? /\\+\]/g : /\\+\)/g; closing.lastIndex = search;
      const closingMatch = closing.exec(text);
      end = closingMatch?.index ?? -1; closingLength = closingMatch?.[0].length ?? 0;
      tex = end < 0 ? "" : text.slice(search, end);
    }
    if (end !== -1 && tex.trim() && !hasProse(tex)) {
      result.push(...legacySegments(text.slice(cursor, start)));
      result.push({ kind: "math", source: text.slice(start, end + closingLength), tex, display });
      cursor = search = end + closingLength;
    } else if (opening === "$$") {
      // A stray display marker before prose is formatting debris, not a formula.
      // Its original source remains available when editing/saving.
      result.push(...legacySegments(text.slice(cursor, start)));
      result.push({ kind: "text", source: opening, displayText: "" });
      cursor = search;
    }
  }
  result.push(...legacySegments(text.slice(cursor)));
  return result;
}
