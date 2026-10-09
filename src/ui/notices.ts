// What the interface tells the user about the state and about failures: one place that maps the
// engine's codes to texts, shared by the popup and the overlay.

import type { EngineState, ErrorCode } from '../core/messages/Protocol.ts';
import type { ClientFailure } from './EngineClient.ts';
import type { MessageKey } from './i18n.ts';
import { LOCK_FIGHT_PLACE } from './optionsPlaces.ts';

/**
 * Outside this band a browser may mute or distort the audio. Source: MDN, HTMLMediaElement
 * playbackRate («Gecko mutes the sound outside the range 0.25 to 4.0»). The notice names
 * no browser: it says what may happen.
 */
export const AUDIO_RELIABLE_RANGE = { min: 0.25, max: 4 } as const;

export const ERROR_MESSAGES: Readonly<Record<ErrorCode, MessageKey>> = {
  'invalid-command': 'errorInvalidCommand',
  'no-player': 'errorNoPlayer',
  'rate-rejected': 'errorRateRejected',
  'pitch-unsupported': 'errorPitchUnsupported',
  'no-previous-rate': 'errorNoPreviousRate',
  'not-seekable': 'errorNotSeekable',
  'not-loopable': 'errorNotLoopable',
  'loop-invalid': 'errorLoopInvalid',
  'pip-unavailable': 'errorPipUnavailable',
  'pip-rejected': 'errorPipRejected',
};

export const FAILURE_MESSAGES: Readonly<
  Record<ClientFailure, { readonly title: MessageKey; readonly hint: MessageKey }>
> = {
  'page-unavailable': { title: 'pageUnavailableTitle', hint: 'pageUnavailableHint' },
  'no-answer': { title: 'noAnswerTitle', hint: 'noAnswerHint' },
};

/** A notice about a choice the user made: it leads to the place on the options page that sets it. */
export interface NoticePlace {
  readonly label: MessageKey;
  readonly place: string;
}

export const NOTICE_PLACES: Readonly<Partial<Record<MessageKey, NoticePlace>>> = {
  noticeContested: { label: 'noticeContestedChoose', place: LOCK_FIGHT_PLACE },
};

/** Lasting notices about the active player, in display order. */
export function stateNotices(state: EngineState): MessageKey[] {
  const notices: MessageKey[] = [];
  if (state.rateContested) notices.push('noticeContested');
  const { rate } = state;
  if (rate !== null && (rate < AUDIO_RELIABLE_RANGE.min || rate > AUDIO_RELIABLE_RANGE.max)) {
    notices.push('noticeExtremeRate');
  }
  if (state.activePlayerId !== null && !state.seekable && state.duration === null) {
    notices.push('noticeLive');
  }
  const silence = state.skipSilence.status;
  if (silence === 'unavailable') notices.push('noticeSkipSilenceUnavailable');
  else if (silence === 'waiting') notices.push('noticeSkipSilenceWaiting');
  return notices;
}
