import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { splitMathText, legacyMathToTex, normalizeMathCommands } from "../lib/math-text";
import { MathText } from "../components/math-text";
import { explanationInstructions } from "../lib/explanation-generation";

test("公式定界符保留复合指数、导数、绝对值与独立推导的范围", () => {
  const text = String.raw`令 $t=x-a^2$，于是 $$t e^{-t}=a e^{a^2}$$，且 \(\frac{\mathrm{d}t}{\mathrm{d}c}=\frac{e^t}{1-t}\)。`;
  const parts = splitMathText(text);
  assert.equal(parts.map(p=>p.source).join(""), text);
  const math=parts.filter(p=>p.kind==='math');
  assert.equal(math.length,3); assert.equal(math[1].display,true);
  assert.equal(math[2].display,false);
  assert.equal(math[1].tex,String.raw`t e^{-t}=a e^{a^2}`);
  const html=renderToStaticMarkup(createElement(MathText,{children:text}));
  assert.match(html,/class="mfrac"/); assert.match(html,/class="msupsub"/);
  assert.match(html,/<math/); assert.doesNotMatch(html,/math-fallback/);
  assert.match(explanationInstructions('高中'),/指数及下标必须用花括号/);
});

test("历史 Unicode 上下标兼容排版，原文及教师输入完整保留",()=>{
  const text='当 x₁<x₂ 时，f(x₀)=1+a²+ln a<0，因此 0<a<α；A 正确。';
  const parts=splitMathText(text);
  assert.equal(parts.map(p=>p.source).join(''),text);
  assert.equal(legacyMathToTex('x₁+a²+1/a'),String.raw`x_{1}+a^{2}+\frac{1}{a}`);
  const html=renderToStaticMarkup(createElement(MathText,{children:text}));
  assert.match(html,/application\/x-tex/); assert.doesNotMatch(html,/math-fallback/);
  // Ambiguous legacy compound exponents must not acquire invented brackets.
  assert.equal(legacyMathToTex('e^t+a²'), 'e^t+a^{2}');
});

test("兼容模型双重转义公式，矩阵换行及原始文本不丢失",()=>{
  const input=String.raw`$a=\\frac{1}{4}$，$\\alpha$`;
  assert.equal(splitMathText(input).map(p=>p.source).join(''),input);
  const html=renderToStaticMarkup(createElement(MathText,{children:input}));
  assert.match(html,/class="mfrac"/); assert.match(html,/α/);
  const matrix=String.raw`\begin{pmatrix}a&b\\c&d\end{pmatrix}`;
  assert.equal(normalizeMathCommands(matrix),matrix);
});

test("损坏公式与未闭合定界符保留源码，普通文本及危险命令不会注入 HTML",()=>{
  const text=String.raw`原文 <img src=x onerror=alert(1)>，$\frac{1}{$，末尾 $x_{1`;
  const html=renderToStaticMarkup(createElement(MathText,{children:text}));
  assert.match(html,/math-fallback/); assert.match(html,/&lt;img/); assert.doesNotMatch(html,/<img/);
  assert.match(html,/末尾/);
  const unsafe=renderToStaticMarkup(createElement(MathText,{children:String.raw`$\href{https://example.com}{x}$`}));
  assert.doesNotMatch(unsafe,/<a\b|href="https/);
});

test("截图中的错位美元标记、独立 aligned 环境和异常控制字符可以排版",()=>{
  const text=String.raw`$$函数在该点的最小值为$$
\begin{aligned}
f(x_{0})
&=a e^{-\ln a}+a^{2}+\ln a\\
&=1+a^{2}+\ln a.
\end{aligned}
$$此外，当 $x\to-\infty$ 时，$f(x)\to+\infty$。
当 $a=\frac14$ 时，$$
f(x_{0})=\frac{17}{16}-\ln4<0, $所以函数有两个零点。
$$两式相减，得到$$
2d=2ae^{m}\u007f\sinh d,
$$即$$
a e^{m}=\frac{d}{\u007f\sinh d}.
$$从而$$`;
  assert.equal(splitMathText(text).map(p=>p.source).join(''),text);
  const html=renderToStaticMarkup(createElement(MathText,{children:text}));
  assert.doesNotMatch(html,/math-fallback|\$\$|u007f/);
  assert.match(html,/class="mfrac"/); assert.match(html,/sinh/); assert.match(html,/aligned/);
  assert.match(html,/函数在该点的最小值为/); assert.match(html,/两式相减/);
});

test("多行行内公式、错配结束标记和正常带中文 text 命令保留结构",()=>{
  const text=String.raw`等式 $a^{2}
+\ln a=0$。\[\begin{aligned}x&=1\\y&=2\end{aligned}\]
$$\frac{1}{2}$ 此外 $\text{当 }a>0$。`;
  assert.equal(splitMathText(text).map(p=>p.source).join(''),text);
  const html=renderToStaticMarkup(createElement(MathText,{children:text}));
  assert.doesNotMatch(html,/math-fallback/); assert.match(html,/mfrac/);
});

test("双重转义的括号定界符、独立环境及控制字符均能显示且源码不变",()=>{
  const text=String.raw`当 \\(a=\\frac14\\) 时，\\[\\frac{d}{\\u007f\\sinh d}\\]。
\\begin{aligned}x&=1\end{aligned}`;
  assert.equal(splitMathText(text).map(p=>p.source).join(''),text);
  const html=renderToStaticMarkup(createElement(MathText,{children:text}));
  assert.doesNotMatch(html,/math-fallback|u007f/); assert.match(html,/mfrac/);
});
