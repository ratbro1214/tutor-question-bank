import test from 'node:test';
import assert from 'node:assert/strict';
import { extractStemTerms } from '../lib/english-stem-vocabulary';
import data from '../data/english/stem-vocabulary.json';
import corpus from '../data/english/reading-practice.json';

test('suggest differentiates textual implications, action advice and ambiguous human subjects', () => {
  assert.deepEqual(extractStemTerms('What does the last paragraph suggest?').filter(t => t.word === 'suggest').map(t => t.id), ['suggest-inference']);
  assert.deepEqual(extractStemTerms('What does Curtin suggest people do?').filter(t => t.word === 'suggest').map(t => t.id), ['suggest-advice']);
  const ambiguous = extractStemTerms('What does Dr. Nieca Goldberg suggest?').filter(t => t.word === 'suggest');
  assert.equal(ambiguous.length, 2);
  assert.ok(ambiguous.every(t => t.needsContext));
});

test('quoted target words are not misidentified as question instructions; word forms and phrases work', () => {
  const terms = extractStemTerms('What does the underlined word “mean” refer to according to paragraph 2?');
  assert.ok(!terms.some(t => t.id === 'mean'));
  assert.ok(!extractStemTerms("What does the word 'suggest' mean?").some(t => t.word === 'suggest'));
  assert.ok(terms.some(t => t.id === 'refer-to'));
  assert.ok(terms.some(t => t.id === 'according-to'));
  assert.ok(extractStemTerms('What can be inferred about the author?').some(t => t.id === 'infer'));
  assert.deepEqual(extractStemTerms('Which best describes the author?').filter(t => /describe/.test(t.id)).map(t => t.id), ['best-describes']);
  assert.equal(extractStemTerms('suggestion meaningful attitudeish').length, 0);
});

test('every generated example is a source MCQ stem; frequency is per question and ranges preserve exact source text', () => {
  const questions = corpus.flatMap(p => p.passages.flatMap(t => t.questions.filter(q => q.type === 'MCQ').map(q => ({ ...q, paperId: p.paperId, passage: t.label }))));
  assert.equal(data.questionCount, 180);
  assert.equal(data.examples.length, questions.length);
  assert.equal(new Set(data.examples.map(e => e.questionId)).size, questions.length);
  for (const example of data.examples) {
    const source = questions.find(q => q.id === example.questionId)!;
    assert.equal(example.stem, source.stem);
    assert.equal(example.paperId, source.paperId);
    assert.equal(example.passage, source.passage);
    assert.deepEqual(example.matches, extractStemTerms(source.stem));
    for (const match of example.matches) assert.equal(example.stem.slice(match.start, match.end), match.matched);
  }
  for (const term of data.terms) assert.equal(term.questionCount, data.examples.filter(e => e.matches.some(m => m.id === term.id)).length);
  assert.equal(data.matchedQuestionCount, data.examples.filter(e => e.matches.length).length);
});
