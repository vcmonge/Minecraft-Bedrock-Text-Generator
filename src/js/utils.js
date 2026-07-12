'use strict';

window.BedrockUtils = Object.freeze({
  setPressedState(button, active) {
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
});
