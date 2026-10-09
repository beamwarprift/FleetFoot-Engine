// How the rate policies and LOCK's answers to a fight are named on the options page: in full, and
// short where a profile names the general one.

import { LOCK_FIGHTS, type LockFight, type RatePolicyName } from '../../core/messages/Protocol.ts';
import type { MessageKey } from '../i18n.ts';

export const POLICY_TEXT: Readonly<Record<RatePolicyName, readonly [MessageKey, MessageKey]>> = {
  follow: ['policyFollow', 'policyFollowHelp'],
  smart: ['policySmart', 'policySmartHelp'],
  lock: ['policyLock', 'policyLockHelp'],
};

/** Inside «General (…)». */
export const POLICY_SHORT_LABELS: Readonly<Record<RatePolicyName, MessageKey>> = {
  follow: 'policyFollowShort',
  smart: 'policySmartShort',
  lock: 'policyLockShort',
};

const FIGHT_HELP_TEXT: Readonly<Record<LockFight, MessageKey>> = {
  yield: 'fightYieldHelp',
  braked: 'fightBrakedHelp',
  unbraked: 'fightUnbrakedHelp',
};

export const FIGHT_LABELS: Readonly<Record<LockFight, MessageKey>> = {
  yield: 'fightYield',
  braked: 'fightBraked',
  unbraked: 'fightUnbraked',
};

/** Inside «General (…)». */
export const FIGHT_SHORT_LABELS: Readonly<Record<LockFight, MessageKey>> = {
  yield: 'fightYieldShort',
  braked: 'fightBrakedShort',
  unbraked: 'fightUnbrakedShort',
};

/** The explanation behind the (i): each answer by its short name, then what it does. */
export const FIGHT_HELP: readonly (readonly [MessageKey, MessageKey])[] = LOCK_FIGHTS.map(
  (fight) => [FIGHT_SHORT_LABELS[fight], FIGHT_HELP_TEXT[fight]] as const,
);
