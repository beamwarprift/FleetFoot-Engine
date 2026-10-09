// The settings the engine itself holds (policy and its answer to a fight, Skip Silence, target,
// pitch) and the commands that carry them.

import { type Command, makeCommand } from '../messages/Protocol.ts';
import type { Settings } from './Settings.ts';

/** The engine-side settings that differ between `before` (null: nothing applied yet) and `after`. */
export function configCommands(before: Settings | null, after: Settings): Command[] {
  const commands: Command[] = [];
  if (before === null || before.ratePolicy !== after.ratePolicy) {
    commands.push(makeCommand('set-rate-policy', { policy: after.ratePolicy }));
  }
  if (before === null || before.lockFight !== after.lockFight) {
    commands.push(makeCommand('set-lock-fight', { fight: after.lockFight }));
  }
  if (
    before === null ||
    before.skipSilence !== after.skipSilence ||
    before.silenceMode !== after.silenceMode ||
    before.silenceRate !== after.silenceRate
  ) {
    commands.push(
      makeCommand('set-skip-silence', {
        enabled: after.skipSilence,
        mode: after.silenceMode,
        silenceRate: after.silenceRate,
      }),
    );
  }
  if (before === null || before.target !== after.target) {
    commands.push(makeCommand('set-target', { target: after.target }));
  }
  if (before === null || before.preservesPitch !== after.preservesPitch) {
    commands.push(makeCommand('set-preserves-pitch', { enabled: after.preservesPitch }));
  }
  return commands;
}
