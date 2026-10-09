// The engine state every response carries (Protocol.ts `EngineState`), read from the ranked
// players and from what the engine keeps: what the interfaces show comes from here only.

import {
  type EngineState,
  type PlayerFrame,
  type PlayerInfo,
  PROTOCOL_VERSION,
  type SkipSilenceState,
  type Target,
} from '../messages/Protocol.ts';
import type { LoopController } from './LoopController.ts';
import { pipState } from './PictureInPicture.ts';
import { roundToHundredths } from './PlaybackRate.ts';
import type { Ranking } from './PlayerSelection.ts';
import type { RateHistory } from './RateHistory.ts';
import type { RatePolicy } from './RatePolicy.ts';
import { remainingTime } from './RemainingTime.ts';
import { isSeekable } from './SeekController.ts';

export interface StateSources {
  readonly ranking: Ranking;
  readonly history: RateHistory;
  readonly policy: RatePolicy;
  readonly loops: LoopController;
  readonly target: Target;
  readonly preservesPitch: boolean;
  readonly site: string | null;
  /** The frame every player of this engine lives in. */
  readonly frame: PlayerFrame | null;
  readonly skipSilence: SkipSilenceState;
}

export function engineState(sources: StateSources): EngineState {
  const { history, policy, loops } = sources;
  const { elements, ranked, active, pinned } = sources.ranking;
  const players: PlayerInfo[] = ranked.map((player) => ({
    id: player.id,
    kind: player.kind,
    playing: player.playing,
    width: Math.round(player.width),
    height: Math.round(player.height),
    frame: sources.frame,
  }));
  const media = active === null ? undefined : elements.get(active.id);
  // Through a skipped silence the player's own speed stays the one shown and counted.
  const rate =
    media === undefined
      ? null
      : history.isBoosted(media)
        ? history.baseRate(media)
        : media.playbackRate;
  const finiteDuration =
    media !== undefined && Number.isFinite(media.duration) && media.duration > 0
      ? media.duration
      : null;
  return {
    v: PROTOCOL_VERSION,
    players,
    activePlayerId: active?.id ?? null,
    pinned,
    rate: rate === null ? null : roundToHundredths(rate),
    preservesPitch: sources.preservesPitch,
    previousRate: media === undefined ? null : history.previous(media),
    holding: history.holding(),
    seekable: media !== undefined && isSeekable(media),
    currentTime: media === undefined ? null : media.currentTime,
    duration: finiteDuration,
    remaining:
      media === undefined || rate === null
        ? null
        : remainingTime(media.duration, media.currentTime, rate),
    target: sources.target,
    ratePolicy: policy.policy,
    desiredRate: policy.desired,
    loop: media === undefined ? null : loops.state(media),
    rateContested: media !== undefined && policy.isContested(media),
    pip: media === undefined ? { available: false, active: false } : pipState(media),
    site: sources.site,
    skipSilence: sources.skipSilence,
    framedSites: sources.ranking.framedSites,
  };
}
