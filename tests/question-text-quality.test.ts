import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { hasUnreadableQuestionText } from '../lib/question-text-quality';
import { LibraryQuestionText } from '../components/library-question-text';

test('PDF 字体损坏的题干预览回退到原图提示，不展示错序公式', () => {
  const text = '\uF07B \uF07D \uF03D a n 4 S a 3. 已知为等比数列';
  assert.equal(hasUnreadableQuestionText(text), true);
  const html = renderToStaticMarkup(createElement(LibraryQuestionText, { text, preview: true }));
  assert.match(html, /请以原始题图为准/);
  assert.doesNotMatch(html, /\uF07B|a n 4 S|<details|katex/);
  const detail = renderToStaticMarkup(createElement(LibraryQuestionText, { text }));
  assert.match(detail, /<details/);
  assert.ok(detail.includes(text));
});

test('正常中文、Unicode 数学符号与 LaTeX 保持可用，不误判换行制表符', () => {
  const text = '抛物线 $x=4y^2$ 的准线方程\n\tA. $y=-\\frac{1}{16}$；x₁≤x₂，α∈ℝ';
  assert.equal(hasUnreadableQuestionText(text), false);
  const html = renderToStaticMarkup(createElement(LibraryQuestionText, { text, preview: true }));
  assert.match(html, /katex/);
  assert.match(html, /抛物线/);
  assert.doesNotMatch(html, /文字提取不完整/);
  assert.equal(hasUnreadableQuestionText('题干\uFFFD'), true);
  assert.equal(hasUnreadableQuestionText('题干\u0001'), true);
  assert.equal(hasUnreadableQuestionText('题干\u{F0000}'), true);
});
