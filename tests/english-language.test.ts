import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blankContext, compareFillAnswer, normalizeFillAnswer } from '../lib/english-language';
test('fill answers normalize whitespace and apostrophes without dropping grammatical distinctions', () => {
  assert.equal(normalizeFillAnswer('  son’s  '), "son's");
  assert.equal(compareFillAnswer(' to   be lifted ', ['to be lifted']).correct, true);
  assert.equal(compareFillAnswer('that', ['which', 'that']).correct, true);
  assert.equal(compareFillAnswer('son', ["son's"]).correct, false);
  assert.equal(compareFillAnswer('are called', ['is called']).correct, false);
  assert.equal(compareFillAnswer('', ['and']).correct, false);
  assert.deepEqual(compareFillAnswer('covering', ['Covering']), { correct: false, caseOnly: true });
});
test('blank context selects the requested original question number', () => {
  assert.equal(blankContext('Before [[41]] after.', 41), 'Before [[41]] after.');
  assert.equal(blankContext('Before [[41]] after.', 42), '');
});
