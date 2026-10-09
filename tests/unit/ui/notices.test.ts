import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../src/core/messages/Protocol.ts';
import { AUDIO_RELIABLE_RANGE, ERROR_MESSAGES, stateNotices } from '../../../src/ui/notices.ts';
import { engineState } from '../state.ts';

describe('stateNotices', () => {
  it('says nothing about an ordinary player', () => {
    expect(stateNotices(engineState({ rate: 1.5 }))).toEqual([]);
  });

  it('warns about audio outside the reliable band, edges excluded', () => {
    expect(stateNotices(engineState({ rate: AUDIO_RELIABLE_RANGE.min }))).toEqual([]);
    expect(stateNotices(engineState({ rate: AUDIO_RELIABLE_RANGE.max }))).toEqual([]);
    expect(stateNotices(engineState({ rate: 0.24 }))).toEqual(['noticeExtremeRate']);
    expect(stateNotices(engineState({ rate: 4.01 }))).toEqual(['noticeExtremeRate']);
  });

  it('reports a contested LOCK and a live stream', () => {
    expect(stateNotices(engineState({ rateContested: true }))).toEqual(['noticeContested']);
    expect(stateNotices(engineState({ seekable: false, duration: null }))).toEqual(['noticeLive']);
    expect(stateNotices(engineState({ seekable: false, duration: 30 }))).toEqual([]);
  });
});

describe('error messages', () => {
  it('cover every error code', () => {
    expect(Object.keys(ERROR_MESSAGES).sort()).toEqual([...ERROR_CODES].sort());
  });
});
