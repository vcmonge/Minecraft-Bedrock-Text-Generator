'use strict';

const syntax = window.BedrockSyntax;
const utils = window.BedrockUtils;

const editor = document.getElementById('editor');
const editorHighlight = document.getElementById('editor-highlight');
const preview = document.getElementById('preview');
const colorPalette = document.getElementById('color-palette');
const btnBold = document.getElementById('btn-bold');
const btnItalic = document.getElementById('btn-italic');
const btnReset = document.getElementById('btn-reset');
const btnNewline = document.getElementById('btn-newline');
const btnTab = document.getElementById('btn-tab');
const btnClearAll = document.getElementById('btn-clear-all');
const btnCopy = document.getElementById('btn-copy');
const toast = document.getElementById('toast');

const colorButtons = new Map();
let parsedDocument = syntax.parse('');
let renderFrame = null;
let copyFeedbackTimer = null;
let toastTimer = null;
let lastSelection = { start: 0, end: 0 };

function initialize() {
  renderColorPalette();
  setupEventListeners();
  renderAll();
}

function renderColorPalette() {
  const fragment = document.createDocumentFragment();

  syntax.MC_COLORS.forEach((color) => {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'color-swatch';
    swatch.style.backgroundColor = color.hex;
    swatch.dataset.code = color.code;
    swatch.setAttribute('aria-label', `Insert color code §${color.code}`);
    swatch.setAttribute('aria-pressed', 'false');
    swatch.title = `Color §${color.code}`;

    const tip = document.createElement('span');
    tip.className = 'swatch-tip';
    tip.textContent = `§${color.code}`;
    swatch.appendChild(tip);

    preserveEditorSelection(swatch);
    swatch.addEventListener('click', () => insertFormattingCode(color.code));

    colorButtons.set(color.code, swatch);
    fragment.appendChild(swatch);
  });

  colorPalette.replaceChildren(fragment);
}

function setupEventListeners() {
  preserveEditorSelection(btnBold);
  preserveEditorSelection(btnItalic);
  preserveEditorSelection(btnReset);
  preserveEditorSelection(btnNewline);
  preserveEditorSelection(btnTab);
  preserveEditorSelection(btnClearAll);

  btnBold.addEventListener('click', () => insertFormattingCode('l'));
  btnItalic.addEventListener('click', () => insertFormattingCode('o'));
  btnReset.addEventListener('click', () => insertFormattingCode('r'));
  btnNewline.addEventListener('click', () => insertAtSavedSelection('\\n'));
  btnTab.addEventListener('click', () => insertAtSavedSelection('\\t'));
  btnClearAll.addEventListener('click', clearAll);
  btnCopy.addEventListener('click', copyCompleteResult);

  editor.addEventListener('input', () => {
    rememberSelection();
    scheduleRender();
  });

  editor.addEventListener('scroll', syncEditorScroll);
  editor.addEventListener('select', handleSelectionChange);
  editor.addEventListener('click', handleSelectionChange);
  editor.addEventListener('keyup', handleSelectionChange);
  editor.addEventListener('focus', handleSelectionChange);
  editor.addEventListener('compositionend', scheduleRender);
  editor.addEventListener('paste', handlePaste);
  editor.addEventListener('beforeinput', (event) => {
    if (
      !event.isComposing &&
      (event.inputType === 'insertLineBreak' ||
        event.inputType === 'insertParagraph')
    ) {
      event.preventDefault();
      rememberSelection();
      insertAtSavedSelection('\\n');
    }
  });

  editor.addEventListener('keydown', (event) => {
    const commandKey = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();

    if (commandKey && !event.altKey && key === 'b') {
      event.preventDefault();
      rememberSelection();
      insertFormattingCode('l');
      return;
    }

    if (commandKey && !event.altKey && key === 'i') {
      event.preventDefault();
      rememberSelection();
      insertFormattingCode('o');
      return;
    }

    if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault();
      rememberSelection();
      insertAtSavedSelection('\\n');
      return;
    }

    if (event.key === 'Tab' && !event.shiftKey) {
      event.preventDefault();
      rememberSelection();
      insertAtSavedSelection('\\t');
    }
  });

  document.addEventListener('selectionchange', () => {
    if (document.activeElement === editor) {
      handleSelectionChange();
    }
  });
}

function handlePaste(event) {
  event.preventDefault();
  const clipboard = event.clipboardData || window.clipboardData;
  const pastedText = clipboard ? clipboard.getData('text/plain') : '';

  rememberSelection();
  insertAtSavedSelection(syntax.serializeForClipboard(pastedText));
}

function preserveEditorSelection(button) {
  button.addEventListener('mousedown', (event) => {
    rememberSelection();
    event.preventDefault();
  });
}

function rememberSelection() {
  lastSelection = {
    start: editor.selectionStart ?? lastSelection.start,
    end: editor.selectionEnd ?? lastSelection.end
  };
}

function handleSelectionChange() {
  rememberSelection();
  updateToolbarState();
}

function insertFormattingCode(code) {
  insertAtSavedSelection(`§${code}`);
}

/**
 * Inserts before the current selection and never removes selected content.
 * After insertion, the caret is placed immediately after the new source text.
 */
function insertAtSavedSelection(insertedText) {
  const edit = syntax.insertAtSelection(
    editor.value,
    lastSelection.start,
    lastSelection.end,
    insertedText
  );

  editor.focus({ preventScroll: true });
  editor.setSelectionRange(edit.anchor, edit.anchor);

  let insertedWithNativeHistory = false;
  try {
    insertedWithNativeHistory = document.execCommand(
      'insertText',
      false,
      insertedText
    );
  } catch (error) {
    insertedWithNativeHistory = false;
  }

  if (!insertedWithNativeHistory) {
    editor.setRangeText(insertedText, edit.anchor, edit.anchor, 'end');
  }

  editor.setSelectionRange(edit.caret, edit.caret);
  lastSelection = { start: edit.caret, end: edit.caret };
  scheduleRender();
}

function clearAll() {
  editor.value = '';
  editor.focus({ preventScroll: true });
  editor.setSelectionRange(0, 0);
  lastSelection = { start: 0, end: 0 };
  scheduleRender();
  showToast('Editor cleared');
}

function scheduleRender() {
  if (renderFrame !== null) {
    return;
  }

  renderFrame = window.requestAnimationFrame(() => {
    renderFrame = null;
    renderAll();
  });
}

function renderAll() {
  parsedDocument = syntax.parse(editor.value);
  renderHighlight(parsedDocument);
  renderPreview(parsedDocument);
  updateToolbarState();
  syncEditorScroll();
}

function renderHighlight(parsed) {
  const fragment = document.createDocumentFragment();

  parsed.runs.forEach((run) => {
    const span = document.createElement('span');
    span.textContent = run.raw;

    if (run.type === 'code') {
      styleCodeToken(span, run);
    } else if (run.type === 'invalid') {
      span.className = 'syntax-invalid';
      applyFormattingState(span, run.state);
      span.title =
        run.reason === 'incomplete-code'
          ? 'Incomplete formatting code'
          : 'Unknown formatting code';
    } else if (run.type === 'escape') {
      span.className = 'syntax-escape';
    } else {
      span.className = 'syntax-text';
      applyFormattingState(span, run.state);
    }

    fragment.appendChild(span);
  });

  // Ensures a final empty source line has the same scroll geometry as textarea.
  if (parsed.source.endsWith('\n') || parsed.source.endsWith('\r')) {
    const sentinel = document.createElement('span');
    sentinel.className = 'mirror-sentinel';
    sentinel.textContent = '\u200b';
    fragment.appendChild(sentinel);
  }

  editorHighlight.replaceChildren(fragment);
}

function styleCodeToken(span, run) {
  span.className = `syntax-code syntax-code-${run.effect}`;
  span.dataset.code = run.code;

  if (run.effect === 'color') {
    span.style.color = syntax.COLOR_MAP[run.code];
    if (syntax.isDarkColor(run.code)) {
      span.classList.add('mc-dark-text');
    }
  } else if (run.effect === 'bold') {
    span.style.fontWeight = '700';
  } else if (run.effect === 'italic') {
    span.style.fontStyle = 'italic';
  }
}

function renderPreview(parsed) {
  const fragment = document.createDocumentFragment();

  parsed.runs.forEach((run) => {
    if (run.type === 'code') {
      return;
    }

    if (
      (run.type === 'control' || run.type === 'escape') &&
      run.value === '\n'
    ) {
      fragment.appendChild(document.createElement('br'));
      return;
    }

    const span = document.createElement('span');
    const isTab =
      (run.type === 'control' || run.type === 'escape') &&
      run.value === '\t';

    span.textContent = isTab ? '\t' : run.raw;
    if (isTab) {
      span.classList.add('preview-tab');
    }
    applyFormattingState(span, run.state);
    fragment.appendChild(span);
  });

  preview.replaceChildren(fragment);
}

function applyFormattingState(element, state) {
  if (state.color) {
    element.style.color = syntax.COLOR_MAP[state.color];
    if (syntax.isDarkColor(state.color)) {
      element.classList.add('mc-dark-text');
    }
  }

  if (state.bold) {
    element.style.fontWeight = '700';
  }

  if (state.italic) {
    element.style.fontStyle = 'italic';
  }
}

function updateToolbarState() {
  const state = syntax.stateAt(parsedDocument, lastSelection.start);

  utils.setPressedState(btnBold, state.bold);
  utils.setPressedState(btnItalic, state.italic);

  colorButtons.forEach((button, code) => {
    utils.setPressedState(button, state.color === code);
  });
}

function syncEditorScroll() {
  editorHighlight.scrollTop = editor.scrollTop;
  editorHighlight.scrollLeft = editor.scrollLeft;
}

async function copyCompleteResult() {
  const source = editor.value;
  if (source.length === 0) {
    showToast('There is no text to copy');
    return;
  }

  const result = syntax.serializeForClipboard(source);

  try {
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      throw new Error('Clipboard API unavailable');
    }
    await navigator.clipboard.writeText(result);
  } catch (error) {
    try {
      copyWithTemporaryTextarea(result);
    } catch (fallbackError) {
      showToast('The browser could not copy the text');
      return;
    }
  }

  showCopyFeedback();
  showToast('Copied as one line');
}

function copyWithTemporaryTextarea(text) {
  const previouslyFocused = document.activeElement;
  const savedSelection = {
    start: editor.selectionStart,
    end: editor.selectionEnd
  };
  const temporary = document.createElement('textarea');

  temporary.value = text;
  temporary.setAttribute('readonly', '');
  temporary.className = 'clipboard-fallback';
  document.body.appendChild(temporary);
  let copied = false;

  try {
    temporary.select();
    copied = document.execCommand('copy');
  } finally {
    temporary.remove();
    editor.setSelectionRange(savedSelection.start, savedSelection.end);
    if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
      previouslyFocused.focus();
    }
  }

  if (!copied) {
    throw new Error('The browser could not copy the text');
  }
}

function showCopyFeedback() {
  window.clearTimeout(copyFeedbackTimer);
  btnCopy.classList.add('copied');
  btnCopy.textContent = 'Copied!';

  copyFeedbackTimer = window.setTimeout(() => {
    btnCopy.classList.remove('copied');
    btnCopy.textContent = 'Copy';
  }, 1800);
}

function showToast(message, duration = 2000) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('show');

  toastTimer = window.setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}

window.BedrockEditor = Object.freeze({ initialize });
