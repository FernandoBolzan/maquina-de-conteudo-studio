export interface WindowPresenter {
  isDestroyed(): boolean;
  show(): void;
  focus(): void;
}

export function focusExistingWindow(window: WindowPresenter | undefined): void {
  if (!window || window.isDestroyed()) return;
  window.show();
  window.focus();
}
