import { afterEach, describe, expect, it } from 'vitest';
import { measurePlayer } from '../../src/core/media/PlayerMeasure.ts';
import { mountMedia, resetPage } from './media.ts';

const viewport = (): { width: number; height: number } => ({
  width: window.innerWidth,
  height: window.innerHeight,
});

afterEach(resetPage);

describe('measurePlayer', () => {
  it('reports the full box of a visible player', () => {
    const media = mountMedia({ width: 320, height: 180 });
    expect(measurePlayer(media, viewport())).toEqual({
      width: 320,
      height: 180,
      visibleArea: 320 * 180,
    });
  });

  it('counts only the part inside the viewport', () => {
    const media = mountMedia({ width: 400, height: 300, style: 'position:absolute;left:0;top:0' });
    media.style.top = `${window.innerHeight - 100}px`;
    expect(measurePlayer(media, viewport()).visibleArea).toBe(400 * 100);
  });

  it('reports no visible area for a player scrolled out of view', () => {
    const media = mountMedia({ width: 400, height: 300, style: 'position:absolute;left:0' });
    media.style.top = `${window.innerHeight + 500}px`;
    const measure = measurePlayer(media, viewport());
    expect(measure.visibleArea).toBe(0);
    expect(measure.width).toBe(400);
  });

  it.each([
    ['display: none', 'display:none'],
    ['visibility: hidden', 'visibility:hidden'],
    ['opacity: 0', 'opacity:0'],
  ])('reports no visible area with %s', (_label, style) => {
    expect(measurePlayer(mountMedia({ style }), viewport()).visibleArea).toBe(0);
  });

  it('sees an invisible ancestor', () => {
    const wrapper = document.createElement('div');
    wrapper.style.opacity = '0';
    document.body.append(wrapper);
    expect(measurePlayer(mountMedia({ parent: wrapper }), viewport()).visibleArea).toBe(0);
  });

  it('reports a zero box for an <audio> without controls', () => {
    expect(measurePlayer(mountMedia({ kind: 'audio' }), viewport())).toEqual({
      width: 0,
      height: 0,
      visibleArea: 0,
    });
  });
});
