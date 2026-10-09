// The engines of every frame of a tab, seen by the popup as one engine. Each frame runs its own
// engine (a player inside an embedded frame lives there); this gathers their players under ids
// that stay stable while the popup is open, shows the frame that holds the player that matters,
// and sends each command where it belongs.

import {
  type Command,
  type EngineState,
  MAX_FRAMED_SITES,
  makeCommand,
  type PlayerInfo,
} from '../core/messages/Protocol.ts';
import type { EngineClient, SendResult } from './EngineClient.ts';

interface FramePlayer {
  readonly frameId: number;
  readonly playerId: number;
}

/** The frame the user looks at: the one with a playing player, else the top frame, else the first. */
function automaticFrame(states: ReadonlyMap<number, EngineState>): number | null {
  const withPlayers = [...states].filter(([, state]) => state.activePlayerId !== null);
  const playing = withPlayers.find(([, state]) =>
    state.players.some((player) => player.id === state.activePlayerId && player.playing),
  );
  if (playing !== undefined) return playing[0];
  if (withPlayers.some(([frameId]) => frameId === 0)) return 0;
  return withPlayers[0]?.[0] ?? null;
}

/**
 * The framed sites every frame names, the top frame's first, without the sites of frames this
 * popup already reaches: those are where a player would be found, and none is.
 */
function unreachedSites(states: ReadonlyMap<number, EngineState>): string[] {
  const reached = new Set([...states.values()].map((state) => state.site));
  const ordered = [...states].sort(([a], [b]) => a - b);
  const sites = new Set(ordered.flatMap(([, state]) => state.framedSites));
  return [...sites].filter((site) => !reached.has(site)).slice(0, MAX_FRAMED_SITES);
}

export function multiFrameClient(frames: ReadonlyMap<number, EngineClient>): EngineClient {
  // A frame-only engine never answers alone: with one frame, nothing changes.
  if (frames.size === 1) {
    const [only] = frames.values();
    if (only !== undefined) return only;
  }
  const states = new Map<number, EngineState>();
  const ids = new Map<string, number>();
  const owners = new Map<number, FramePlayer>();
  // A player chosen in a frame keeps that frame; null follows the automatic choice.
  let chosenFrame: number | null = null;

  const idOf = (frameId: number, playerId: number): number => {
    const key = `${frameId}:${playerId}`;
    let id = ids.get(key);
    if (id === undefined) {
      id = ids.size + 1;
      ids.set(key, id);
      owners.set(id, { frameId, playerId });
    }
    return id;
  };

  const shownFrame = (): number =>
    chosenFrame !== null && states.has(chosenFrame) ? chosenFrame : (automaticFrame(states) ?? 0);

  /** The shown frame's state, with every frame's players under their ids. */
  const composite = (): EngineState | null => {
    const frameId = shownFrame();
    const shown = states.get(frameId) ?? [...states.values()][0];
    if (shown === undefined) return null;
    const players: PlayerInfo[] = [];
    for (const [id, state] of [
      [frameId, shown] as const,
      ...[...states].filter(([other]) => other !== frameId),
    ]) {
      for (const player of state.players) players.push({ ...player, id: idOf(id, player.id) });
    }
    return {
      ...shown,
      players,
      activePlayerId: shown.activePlayerId === null ? null : idOf(frameId, shown.activePlayerId),
      // A player chosen in another frame counts as chosen here too.
      pinned: shown.pinned || chosenFrame !== null,
      framedSites: unreachedSites(states),
    };
  };

  const answer = (result: SendResult, frameId: number): SendResult => {
    if (!result.ok) return result;
    states.set(frameId, result.response.state);
    const state = composite();
    return state === null ? result : { ok: true, response: { ...result.response, state } };
  };

  const framesWithPlayers = (): number[] =>
    [...states].filter(([, state]) => state.players.length > 0).map(([frameId]) => frameId);

  return {
    async send(command: Command) {
      if (command.type === 'select-player') {
        if (command.playerId === null) {
          // Automatic again, in every frame.
          chosenFrame = null;
          const results = await Promise.all(
            [...frames].map(async ([frameId, client]) =>
              answer(await client.send(command), frameId),
            ),
          );
          return (
            results.find((result) => result.ok) ?? results[0] ?? { ok: false, failure: 'no-answer' }
          );
        }
        const owner = owners.get(command.playerId);
        const client = owner === undefined ? undefined : frames.get(owner.frameId);
        // An id this popup never gave out names no player.
        if (owner === undefined || client === undefined) return { ok: false, failure: 'no-answer' };
        chosenFrame = owner.frameId;
        return answer(
          await client.send(makeCommand('select-player', { playerId: owner.playerId })),
          owner.frameId,
        );
      }
      const shown = shownFrame();
      // The choice between the active player and all players holds in every frame; with all
      // players, every command covers the players of every frame.
      const targets =
        command.type === 'set-target'
          ? [...frames.keys()]
          : states.get(shown)?.target === 'all'
            ? framesWithPlayers()
            : [shown];
      const results = await Promise.all(
        (targets.length > 0 ? targets : [shown]).map(async (frameId) => {
          const client = frames.get(frameId);
          return client === undefined
            ? ({ ok: false, failure: 'no-answer' } as const)
            : answer(await client.send(command), frameId);
        }),
      );
      const index = Math.max(0, targets.indexOf(shown));
      return results[index] ?? results[0] ?? { ok: false, failure: 'no-answer' };
    },
    watch(onState, onLost) {
      let alive = frames.size;
      const stops = [...frames].map(([frameId, client]) =>
        client.watch(
          (state) => {
            states.set(frameId, state);
            const merged = composite();
            if (merged !== null) onState(merged);
          },
          () => {
            states.delete(frameId);
            alive -= 1;
            // The tab is gone when the top frame or every frame is.
            if (frameId === 0 || alive === 0) onLost();
            else {
              const merged = composite();
              if (merged !== null) onState(merged);
            }
          },
        ),
      );
      return () => {
        for (const stop of stops) stop();
      };
    },
  };
}
