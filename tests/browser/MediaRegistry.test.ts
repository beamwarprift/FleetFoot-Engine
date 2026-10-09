import { afterEach, describe, expect, it } from 'vitest';
import { MediaRegistry } from '../../src/core/media/MediaRegistry.ts';
import { mountMedia, mutationsDelivered, resetPage } from './media.ts';

const registries: MediaRegistry[] = [];

function started(): MediaRegistry {
  const registry = new MediaRegistry(document);
  registry.start();
  registries.push(registry);
  return registry;
}

afterEach(() => {
  for (const registry of registries.splice(0)) registry.stop();
  resetPage();
});

describe('MediaRegistry', () => {
  it('finds the media already on the page when it starts', () => {
    const video = mountMedia();
    const audio = mountMedia({ kind: 'audio' });
    const registry = started();
    expect(registry.list()).toEqual([video, audio]);
  });

  it('finds media added later, directly or inside a new subtree', async () => {
    const registry = started();
    const direct = mountMedia();
    const wrapper = document.createElement('div');
    const inner = document.createElement('section');
    wrapper.append(inner);
    const nested = mountMedia({ kind: 'audio', parent: inner });
    document.body.append(wrapper);
    await mutationsDelivered();
    expect(registry.list()).toEqual([direct, nested]);
  });

  it('drops removed media and keeps moved media with the same id', async () => {
    const registry = started();
    const leaving = mountMedia();
    const moving = mountMedia();
    await mutationsDelivered();
    const movingId = registry.idOf(moving);

    leaving.remove();
    const target = document.createElement('div');
    document.body.append(target);
    target.append(moving);
    await mutationsDelivered();

    expect(registry.list()).toEqual([moving]);
    expect(registry.idOf(moving)).toBe(movingId);
    expect(registry.byId(registry.idOf(leaving) ?? -1)).toBeUndefined();
  });

  it('never resolves an id to a detached element, even before the mutation records arrive', async () => {
    const registry = started();
    const media = mountMedia();
    await mutationsDelivered();
    const id = registry.idOf(media) ?? -1;
    media.remove();
    expect(registry.byId(id)).toBeUndefined();
  });

  it('drops media whose ancestor is removed', async () => {
    const registry = started();
    const container = document.createElement('div');
    document.body.append(container);
    mountMedia({ parent: container });
    await mutationsDelivered();
    container.remove();
    await mutationsDelivered();
    expect(registry.list()).toEqual([]);
  });

  it('never reuses an id', async () => {
    const registry = started();
    const first = mountMedia();
    await mutationsDelivered();
    const firstId = registry.idOf(first);
    first.remove();
    const second = mountMedia();
    await mutationsDelivered();
    expect(registry.idOf(second)).not.toBe(firstId);
    expect(registry.idOf(second)).toBeGreaterThan(firstId ?? 0);
  });

  it('stops observing after stop()', async () => {
    const registry = started();
    registry.stop();
    mountMedia();
    await mutationsDelivered();
    expect(registry.list()).toEqual([]);
  });
});
