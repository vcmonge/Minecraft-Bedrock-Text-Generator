'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const syntax = require('../src/js/bedrock-syntax.js');

test('applies the cumulative states from the documented example', () => {
  const source =
    '§aGreen §lgreen bold §bblue bold §oblue bold italic §r§cred';
  const parsed = syntax.parse(source);
  const textRuns = parsed.runs.filter((run) => run.type === 'text');

  assert.deepEqual(textRuns.map((run) => run.state), [
    { color: 'a', bold: false, italic: false },
    { color: 'a', bold: true, italic: false },
    { color: 'b', bold: true, italic: false },
    { color: 'b', bold: true, italic: true },
    { color: 'c', bold: false, italic: false }
  ]);
});

test('keeps consecutive and redundant codes in the parsed source', () => {
  const parsed = syntax.parse('§a§a§l§lText');
  const codes = parsed.runs.filter((run) => run.type === 'code');

  assert.equal(codes.length, 4);
  assert.equal(parsed.source, '§a§a§l§lText');
  assert.deepEqual(parsed.finalState, {
    color: 'a',
    bold: true,
    italic: false
  });
});

test('preserves unknown and incomplete codes as invalid runs', () => {
  const parsed = syntax.parse('A§xB§');
  const invalid = parsed.runs.filter((run) => run.type === 'invalid');

  assert.deepEqual(invalid.map((run) => run.raw), ['§x', '§']);
  assert.deepEqual(invalid.map((run) => run.reason), [
    'unknown-code',
    'incomplete-code'
  ]);
});

test('reports formatting at an exact source offset', () => {
  const parsed = syntax.parse('A§lBC§rD');

  assert.deepEqual(syntax.stateAt(parsed, 1), {
    color: null,
    bold: false,
    italic: false
  });
  assert.deepEqual(syntax.stateAt(parsed, 3), {
    color: null,
    bold: true,
    italic: false
  });
  assert.deepEqual(syntax.stateAt(parsed, 8), {
    color: null,
    bold: false,
    italic: false
  });
});

test('serializes physical line breaks and tabs into one line', () => {
  const source = 'First\r\nSecond\nThird\tEnd\u2028More\\nLiteral';

  assert.equal(
    syntax.serializeForClipboard(source),
    'First\\nSecond\\nThird\\tEnd\\nMore\\nLiteral'
  );
});

test('inserts before a selection without replacing it', () => {
  const edit = syntax.insertAtSelection('one two', 4, 7, '§c');

  assert.equal(edit.value, 'one §ctwo');
  assert.equal(edit.caret, 6);
  assert.equal(edit.replacedSelection, false);
});
