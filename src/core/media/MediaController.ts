// Applies validated commands to their target players and reports the engine state: it follows
// the media of the page and routes each command; the speed is `RateControl.ts`, the players a
// command reaches `CommandTargets.ts`, silences `SilenceSkipper.ts`, the state `engineState.ts`.

import type {
  EngineState,
  ErrorCode,
  PlayerFrame,
  Response,
  ValidCommand,
} from '../messages/Protocol.ts';
import { CommandTargets } from './CommandTargets.ts';
import { engineState } from './engineState.ts';
import { LoopController } from './LoopController.ts';
import type { MediaRegistry } from './MediaRegistry.ts';
import { togglePip } from './PictureInPicture.ts';
import { applyPreservesPitch } from './PitchController.ts';
import { toRate } from './PlaybackRate.ts';
import { PlayerSelection, type PlayerSelectionDeps } from './PlayerSelection.ts';
import { DEFAULT_PRESERVES_PITCH, DEFAULT_RATE } from './Presets.ts';
import { RateControl } from './RateControl.ts';
import { RateHistory } from './RateHistory.ts';
import { RatePolicy } from './RatePolicy.ts';
import { RateShield } from './RateShield.ts';
import { SavedTime } from './SavedTime.ts';
import { seekBy } from './SeekController.ts';
import type { SilenceListen } from './SilenceListener.ts';
import { SilenceSkipper } from './SilenceSkipper.ts';

export interface MediaControllerDeps extends PlayerSelectionDeps {
  /** Seconds saved on players this engine sped up (the time-saved counter). */
  readonly onTimeSaved?: (seconds: number) => void;
  /** Null in the tab's top frame; the embedded frame otherwise. */
  readonly frame?: PlayerFrame | null;
  /**
   * The state changed with no page event to show it: a speed change hidden from the page (LOCK
   * against a fight), or Skip Silence hearing, skipping or not allowed to hear.
   */
  readonly onHiddenChange?: () => void;
  /** How Skip Silence hears the active player. */
  readonly listen?: SilenceListen;
}

export class MediaController {
  readonly #registry: MediaRegistry;
  readonly #selection: PlayerSelection;
  readonly #targets: CommandTargets;
  readonly #history = new RateHistory();
  readonly #shield: RateShield;
  readonly #policy: RatePolicy;
  readonly #rate: RateControl;
  readonly #loops = new LoopController();
  readonly #skipper: SilenceSkipper;
  // Per-element listeners, removed with the element.
  readonly #watchers = new WeakMap<HTMLMediaElement, AbortController>();
  #preservesPitch = DEFAULT_PRESERVES_PITCH;

  readonly #saved: SavedTime;
  readonly #site: string | null;
  readonly #frame: PlayerFrame | null;

  constructor(deps: MediaControllerDeps) {
    this.#registry = deps.registry;
    this.#selection = new PlayerSelection(deps);
    this.#targets = new CommandTargets(deps.registry, this.#selection);
    this.#site = deps.site ?? null;
    this.#frame = deps.frame ?? null;
    const changed = deps.onHiddenChange;
    this.#shield = new RateShield({ hidden: () => changed?.() });
    const write = (media: HTMLMediaElement, rate: number) => this.#shield.write(media, rate);
    this.#policy = new RatePolicy({
      write,
      isHeld: (media) => this.#history.isOverridden(media),
      shield: this.#shield,
    });
    this.#rate = new RateControl({
      write,
      history: this.#history,
      policy: this.#policy,
      targets: () => this.#targets.all(),
      active: () => this.#targets.active(),
      preservesPitch: () => this.#preservesPitch,
    });
    const report = deps.onTimeSaved;
    this.#saved = new SavedTime({
      isOurs: (media) => this.#history.isOverridden(media) || this.#policy.holdsUserRate(media),
      report: (seconds) => report?.(seconds),
    });
    this.#skipper = new SilenceSkipper({
      write,
      history: this.#history,
      target: () => this.#targets.active(),
      changed: () => changed?.(),
      released: (media) => this.#policy.rateChanged(media),
      keepsBase: (media) => this.#policy.policy === 'lock' && !this.#policy.isContested(media),
      ...(deps.listen === undefined ? {} : { listen: deps.listen }),
    });
  }

  /** Reports the time saved so far: the page is going away or out of sight. */
  flushTimeSaved(): void {
    this.#saved.flush();
  }

  /** Called by the registry once per batch of media entering the page. */
  mediaAdded(added: readonly HTMLMediaElement[]): void {
    for (const media of added) this.#watch(media);
    this.#skipper.refresh();
    if (!this.#policy.adopting) return;
    // A recreated or replacing player gets the user's rate when it becomes the target.
    let adopted = added;
    if (this.#targets.mode !== 'all') {
      // Ranked once for the whole batch.
      const active = this.#targets.active();
      adopted = added.filter((media) => media === active);
    }
    for (const media of adopted) this.#policy.adopt(media);
    if (adopted.length > 0) this.#policy.settle();
  }

  mediaRemoved(removed: readonly HTMLMediaElement[]): void {
    for (const media of removed) this.#unwatch(media);
    this.#skipper.refresh();
  }

  /** Leaves every tracked element as the user would expect without the engine. */
  stop(): void {
    this.#saved.flush();
    this.#skipper.stop();
    this.#rate.restoreHolds();
    for (const media of this.#registry.list()) {
      this.#loops.clear(media);
      this.#unwatch(media);
    }
    this.#shield.stop();
  }

  #unwatch(media: HTMLMediaElement): void {
    this.#watchers.get(media)?.abort();
    this.#watchers.delete(media);
    this.#policy.forget(media);
  }

  #watch(media: HTMLMediaElement): void {
    if (this.#watchers.has(media)) return;
    const abort = new AbortController();
    this.#watchers.set(media, abort);
    const { signal } = abort;
    media.addEventListener('ratechange', () => this.#policy.rateChanged(media), { signal });
    // A player that starts may become the active one, which Skip Silence follows.
    media.addEventListener('play', () => this.#skipper.refresh(), { signal });
    this.#saved.watch(media, signal);
    media.addEventListener(
      'loadstart',
      () => {
        this.#loops.sourceChanged(media);
        this.#policy.sourceChanged(media);
        this.#skipper.sourceChanged(media);
      },
      { signal },
    );
  }

  /** Synchronous except for Picture-in-Picture, which waits for the browser's answer. */
  handle(command: ValidCommand): Response | Promise<Response> {
    switch (command.type) {
      case 'get-state':
        return this.#ok();
      case 'set-rate':
        return this.#answer(this.#rate.set(command.rate));
      case 'adjust-rate':
        return this.#answer(this.#rate.adjust(command.delta));
      case 'reset-rate': {
        const rate = toRate(DEFAULT_RATE);
        return this.#answer(rate === null ? 'rate-rejected' : this.#rate.set(rate));
      }
      case 'previous-rate':
        return this.#answer(this.#rate.previous());
      case 'hold-start':
        return this.#answer(this.#rate.holdStart(command.rate));
      case 'hold-end':
        this.#rate.restoreHolds();
        return this.#ok();
      case 'seek':
        return this.#seek(command.seconds);
      case 'set-preserves-pitch':
        return this.#setPreservesPitch(command.enabled);
      case 'select-player':
        return this.#selectPlayer(command.playerId);
      case 'set-target':
        this.#targets.mode = command.target;
        return this.#ok();
      case 'set-rate-policy':
        this.#policy.policy = command.policy;
        return this.#takeBack();
      case 'set-lock-fight':
        this.#policy.fight = command.fight;
        return this.#takeBack();
      case 'set-skip-silence':
        this.#skipper.configure(command.enabled, command.mode, command.silenceRate);
        return this.#ok();
      case 'loop-set-a':
        return this.#loop((media) => this.#loops.setA(media));
      case 'loop-set-b':
        return this.#loop((media) => this.#loops.setB(media));
      case 'loop-enable':
        return this.#loop((media) => this.#loops.setEnabled(media, command.enabled));
      case 'loop-clear':
        return this.#loop((media) => {
          this.#loops.clear(media);
          return null;
        });
      case 'pip-toggle':
        return this.#pip();
      case 'set-default-rate':
        return this.#answer(this.#rate.setDefault(command.rate));
      case 'set-media-rate':
        return this.#answer(this.#rate.set(command.rate, this.#targets.at(command.src)));
    }
  }

  /** LOCK gives the chosen rate authority from now on, also over a change the site made before. */
  #takeBack(): Response {
    for (const media of this.#registry.list()) this.#policy.rateChanged(media);
    return this.#ok();
  }

  #seek(seconds: number): Response {
    const target = this.#targets.active();
    if (target === null) return this.#fail('no-player');
    return seekBy(target, seconds) === null ? this.#fail('not-seekable') : this.#ok();
  }

  #loop(apply: (media: HTMLMediaElement) => ErrorCode | null): Response {
    const target = this.#targets.active();
    if (target === null) return this.#fail('no-player');
    const error = apply(target);
    return error === null ? this.#ok() : this.#fail(error);
  }

  async #pip(): Promise<Response> {
    const target = this.#targets.active();
    if (target === null) return this.#fail('no-player');
    const error = await togglePip(target);
    return error === null ? this.#ok() : this.#fail(error);
  }

  #setPreservesPitch(enabled: boolean): Response {
    this.#preservesPitch = enabled;
    let supported = true;
    for (const media of this.#targets.all()) {
      if (!applyPreservesPitch(media, enabled)) supported = false;
    }
    return supported ? this.#ok() : this.#fail('pitch-unsupported');
  }

  #selectPlayer(playerId: number | null): Response {
    if (!this.#selection.select(playerId)) return this.#fail('no-player');
    this.#skipper.refresh();
    return this.#ok();
  }

  /** The current state, as every response carries it. */
  snapshot(): EngineState {
    return this.#state();
  }

  /** The player commands act on now; the page's own interface positions itself on it. */
  activeMedia(): HTMLMediaElement | null {
    return this.#targets.active();
  }

  #state(): EngineState {
    return engineState({
      ranking: this.#selection.rank(),
      history: this.#history,
      policy: this.#policy,
      loops: this.#loops,
      target: this.#targets.mode,
      preservesPitch: this.#preservesPitch,
      skipSilence: this.#skipper.state(),
      site: this.#site,
      frame: this.#frame,
    });
  }

  #answer(error: ErrorCode | null): Response {
    return error === null ? this.#ok() : this.#fail(error);
  }

  #ok(): Response {
    return { ok: true, state: this.#state() };
  }

  #fail(error: ErrorCode): Response {
    return { ok: false, error, state: this.#state() };
  }
}
