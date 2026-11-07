export const MIN_PROMPT_COMPOSER_HEIGHT = 140;

/** Leave a usable scrolling viewport above the editor, including at UI zoom. */
export function promptComposerMaximumHeight(panelHeight: number, fixedHeight: number) {
  const available = Math.max(MIN_PROMPT_COMPOSER_HEIGHT, panelHeight - fixedHeight);
  const parameterViewport = Math.min(180, Math.max(120, Math.round(available * 0.35)));
  return Math.max(MIN_PROMPT_COMPOSER_HEIGHT, Math.min(520, available - parameterViewport));
}

export function promptComposerHeight(preferred: number, automatic: number, maximum: number, manual: boolean) {
  return Math.round(Math.min(maximum, Math.max(MIN_PROMPT_COMPOSER_HEIGHT, manual ? preferred : Math.max(preferred, automatic))));
}
