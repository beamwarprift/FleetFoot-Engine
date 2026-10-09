// What the user can ask of the popup; the controller (Popup.ts) turns it into commands or settings.

export interface PopupActions {
  slower(): void;
  faster(): void;
  typedRate(text: string): void;
  reset(): void;
  previous(): void;
  favorite(): void;
  preset(rate: number): void;
  pitch(enabled: boolean): void;
  skipSilence(enabled: boolean): void;
  seek(direction: 1 | -1): void;
  loopA(): void;
  loopB(): void;
  loopToggle(enabled: boolean): void;
  loopClear(): void;
  pip(): void;
  copyTimestamp(): void;
  choosePlayer(choice: PlayerChoice): void;
  openOptions(): void;
  retry(): void;
  /** Asked inside the user's click: the browser prompts for the access. */
  allowSite(site: string): void;
  allowAllSites(): void;
}

export type PlayerChoice =
  | { readonly kind: 'auto' }
  | { readonly kind: 'all' }
  | { readonly kind: 'player'; readonly id: number };
