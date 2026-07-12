(function initBedrockSyntax(root, factory) {
  const api = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.BedrockSyntax = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createBedrockSyntax() {
  'use strict';

  const MC_COLORS = Object.freeze([
    { code: '0', hex: '#000000' },
    { code: '1', hex: '#0000AA' },
    { code: '2', hex: '#00AA00' },
    { code: '3', hex: '#00AAAA' },
    { code: '4', hex: '#AA0000' },
    { code: '5', hex: '#AA00AA' },
    { code: '6', hex: '#FFAA00' },
    { code: '7', hex: '#AAAAAA' },
    { code: '8', hex: '#555555' },
    { code: '9', hex: '#5555FF' },
    { code: 'a', hex: '#55FF55' },
    { code: 'b', hex: '#55FFFF' },
    { code: 'c', hex: '#FF5555' },
    { code: 'd', hex: '#FF55FF' },
    { code: 'e', hex: '#FFFF55' },
    { code: 'f', hex: '#FFFFFF' },
    { code: 'g', hex: '#DDD605' },
    { code: 'h', hex: '#E3D4D1' },
    { code: 'i', hex: '#CECACA' },
    { code: 'j', hex: '#443A3B' },
    { code: 'm', hex: '#971607' },
    { code: 'n', hex: '#B4684D' },
    { code: 'p', hex: '#DEB12D' },
    { code: 'q', hex: '#47A036' },
    { code: 's', hex: '#2CBAA8' },
    { code: 't', hex: '#21497B' },
    { code: 'u', hex: '#9A5CC6' },
    { code: 'v', hex: '#EB7114' },
    { code: 'w', hex: '#8BB3FF' }
  ]);

  const COLOR_MAP = Object.freeze(
    MC_COLORS.reduce((map, color) => {
      map[color.code] = color.hex;
      return map;
    }, {})
  );

  const DARK_COLOR_CODES = Object.freeze(['0', '1', '4', '8', 'j', 'm', 't']);
  const DARK_COLOR_SET = new Set(DARK_COLOR_CODES);

  function createState(color = null, bold = false, italic = false) {
    return { color, bold, italic };
  }

  function cloneState(state) {
    return createState(state.color, state.bold, state.italic);
  }

  function statesEqual(left, right) {
    return (
      left.color === right.color &&
      left.bold === right.bold &&
      left.italic === right.italic
    );
  }

  /**
   * Parses the editor source in one pass. Color codes only replace the active
   * color; bold and italic remain active until an explicit reset.
   */
  function parse(source) {
    const text = String(source ?? '');
    const runs = [];
    let state = createState();
    let index = 0;

    function pushRun(type, raw, start, extra = {}) {
      const runState = cloneState(state);
      const previous = runs[runs.length - 1];

      if (
        type === 'text' &&
        previous &&
        previous.type === 'text' &&
        previous.end === start &&
        statesEqual(previous.state, runState)
      ) {
        previous.raw += raw;
        previous.end += raw.length;
        return previous;
      }

      const run = {
        type,
        raw,
        start,
        end: start + raw.length,
        state: runState,
        ...extra
      };
      runs.push(run);
      return run;
    }

    while (index < text.length) {
      const char = text[index];

      if (char === '§') {
        if (index + 1 >= text.length) {
          pushRun('invalid', char, index, { reason: 'incomplete-code' });
          index += 1;
          continue;
        }

        const rawCode = text[index + 1];
        const code = rawCode.toLowerCase();
        const raw = text.slice(index, index + 2);

        if (code === 'r') {
          const run = pushRun('code', raw, index, {
            code,
            effect: 'reset'
          });
          state = createState();
          run.nextState = cloneState(state);
        } else if (code === 'l') {
          const run = pushRun('code', raw, index, {
            code,
            effect: 'bold'
          });
          state = createState(state.color, true, state.italic);
          run.nextState = cloneState(state);
        } else if (code === 'o') {
          const run = pushRun('code', raw, index, {
            code,
            effect: 'italic'
          });
          state = createState(state.color, state.bold, true);
          run.nextState = cloneState(state);
        } else if (Object.hasOwn(COLOR_MAP, code)) {
          const run = pushRun('code', raw, index, {
            code,
            effect: 'color'
          });
          state = createState(code, state.bold, state.italic);
          run.nextState = cloneState(state);
        } else {
          pushRun('invalid', raw, index, {
            code: rawCode,
            reason: 'unknown-code'
          });
        }

        index += 2;
        continue;
      }

      if (char === '\\' && index + 1 < text.length) {
        const escaped = text[index + 1];
        if (escaped === 'n' || escaped === 't') {
          pushRun('escape', text.slice(index, index + 2), index, {
            value: escaped === 'n' ? '\n' : '\t'
          });
          index += 2;
          continue;
        }
      }

      if (char === '\r') {
        const raw = text[index + 1] === '\n' ? '\r\n' : '\r';
        pushRun('control', raw, index, { value: '\n' });
        index += raw.length;
        continue;
      }

      if (char === '\n' || char === '\t') {
        pushRun('control', char, index, { value: char });
        index += 1;
        continue;
      }

      const start = index;
      while (index < text.length) {
        const current = text[index];
        const startsEscape =
          current === '\\' &&
          index + 1 < text.length &&
          (text[index + 1] === 'n' || text[index + 1] === 't');

        if (
          current === '§' ||
          current === '\r' ||
          current === '\n' ||
          current === '\t' ||
          startsEscape
        ) {
          break;
        }
        index += 1;
      }

      pushRun('text', text.slice(start, index), start);
    }

    return {
      source: text,
      runs,
      finalState: cloneState(state)
    };
  }

  function stateAt(parsedOrSource, requestedOffset) {
    const parsed =
      typeof parsedOrSource === 'string' ? parse(parsedOrSource) : parsedOrSource;
    const offset = Math.max(
      0,
      Math.min(Number(requestedOffset) || 0, parsed.source.length)
    );
    let state = createState();

    for (const run of parsed.runs) {
      if (run.start >= offset) {
        break;
      }

      if (run.type === 'code' && run.end <= offset) {
        state = cloneState(run.nextState);
      }
    }

    return state;
  }

  function serializeForClipboard(source) {
    return String(source ?? '')
      .replace(/\r\n?|\n|\u2028|\u2029/g, '\n')
      .replace(/\n/g, '\\n')
      .replace(/\t/g, '\\t');
  }

  function insertAtSelection(source, selectionStart, selectionEnd, insertion) {
    const text = String(source ?? '');
    const start = Math.max(
      0,
      Math.min(Number(selectionStart) || 0, text.length)
    );
    const end = Math.max(
      start,
      Math.min(Number(selectionEnd) || start, text.length)
    );
    const insertedText = String(insertion ?? '');

    return {
      value: text.slice(0, start) + insertedText + text.slice(start),
      anchor: start,
      replacedSelection: false,
      previousSelection: { start, end },
      caret: start + insertedText.length
    };
  }

  return Object.freeze({
    MC_COLORS,
    COLOR_MAP,
    DARK_COLOR_CODES,
    isDarkColor(code) {
      return DARK_COLOR_SET.has(code);
    },
    parse,
    stateAt,
    serializeForClipboard,
    insertAtSelection
  });
});
