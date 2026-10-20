/** Markup for the controls legend, shared by the start screen and the help modal. */

export function keyboardControlsMarkup(): string {
  return `
    <div class="control-group">
      <kbd class="key key-wide">Space</kbd>
      <span class="control-label">Flap</span>
    </div>
    <div class="control-group">
      <kbd class="key">P</kbd>
      <span class="control-label">Pause</span>
    </div>
    <div class="control-group">
      <kbd class="key key-wide">Enter</kbd>
      <span class="control-label">Start</span>
    </div>`;
}

export function touchControlsMarkup(): string {
  return `
    <div class="control-group control-group-tap">
      <span class="tap-icon" role="img" aria-label="Tap"><i></i></span>
      <span class="control-label">Tap the screen to flap.</span>
    </div>`;
}

export function renderControls(target: HTMLElement, touch: boolean): void {
  target.innerHTML = touch ? touchControlsMarkup() : keyboardControlsMarkup();
}
