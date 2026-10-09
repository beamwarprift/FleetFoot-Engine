import { describe, expect, it } from 'vitest';
import { ALL_SITES, accessFromOrigins } from '../../../src/core/settings/Access.ts';
import {
  parseSiteInput,
  SITE_INPUT_MAX_LENGTH,
  siteOf,
  siteOfPattern,
  sitePatterns,
} from '../../../src/core/settings/Sites.ts';

describe('siteOf', () => {
  it('names a site by its hostname, lowercase, without www', () => {
    expect(siteOf('www.YouTube.com')).toBe('youtube.com');
    expect(siteOf('m.youtube.com')).toBe('m.youtube.com');
    expect(siteOf('coursera.org.')).toBe('coursera.org');
  });

  it('takes a home server and addresses as sites', () => {
    expect(siteOf('localhost')).toBe('localhost');
    expect(siteOf('nas')).toBe('nas');
    expect(siteOf('192.168.1.20')).toBe('192.168.1.20');
    expect(siteOf('[::1]')).toBe('[::1]');
  });

  it('gives no site where there is none or the name is not a hostname', () => {
    for (const hostname of ['', 'a..b', '-bad.com', 'bad-.com', 'spa ce.com', 'x'.repeat(64)]) {
      expect(siteOf(hostname)).toBeNull();
    }
    expect(siteOf(`${`${'a'.repeat(63)}.`.repeat(4)}com`)).toBeNull();
  });
});

describe('parseSiteInput', () => {
  it('takes a bare name or an address, and keeps only the site', () => {
    expect(parseSiteInput('example.com')).toBe('example.com');
    expect(parseSiteInput('  https://www.Example.com/watch?v=1  ')).toBe('example.com');
    expect(parseSiteInput('http://video.example.org/a/b')).toBe('video.example.org');
  });

  it('takes a long pasted address, tracking parameters and all', () => {
    const address = `https://www.example.com/watch?v=1&${'utm_source=newsletter&'.repeat(40)}t=5`;
    expect(address.length).toBeGreaterThan(800);
    expect(parseSiteInput(address)).toBe('example.com');
    expect(parseSiteInput(`${address}${'x'.repeat(SITE_INPUT_MAX_LENGTH)}`)).toBeNull();
  });

  it('refuses anything that is not a web site', () => {
    for (const text of [
      '',
      'not a site',
      'ftp://example.com',
      'javascript:alert(1)',
      'file:///home/me/video.mp4',
      'https://user:pass@example.com',
      'https://example.com:8080',
      'https://',
      `https://${'a'.repeat(SITE_INPUT_MAX_LENGTH)}.com`,
      '<script>.com',
    ]) {
      expect(parseSiteInput(text), text).toBeNull();
    }
  });
});

describe('sitePatterns', () => {
  it('covers the site and its subdomains on both web schemes, inside the declared permissions', () => {
    expect(sitePatterns('example.com')).toEqual([
      'http://example.com/*',
      'https://example.com/*',
      'http://*.example.com/*',
      'https://*.example.com/*',
    ]);
    expect(sitePatterns('192.168.1.20')).toEqual([
      'http://192.168.1.20/*',
      'https://192.168.1.20/*',
    ]);
  });

  it('reads the site back from each of its patterns, and from nothing else', () => {
    for (const pattern of sitePatterns('example.com'))
      expect(siteOfPattern(pattern)).toBe('example.com');
    for (const pattern of [
      'http://*/*',
      '<all_urls>',
      'https://example.com/path/*',
      'ftp://x.com/*',
    ]) {
      expect(siteOfPattern(pattern)).toBeNull();
    }
  });
});

describe('accessFromOrigins', () => {
  it('reads the mode from the granted permissions alone', () => {
    expect(accessFromOrigins([])).toEqual({ mode: 'on-click', sites: [] });
    expect(accessFromOrigins([...sitePatterns('b.com'), ...sitePatterns('a.com')])).toEqual({
      mode: 'selected',
      sites: ['a.com', 'b.com'],
    });
    expect(accessFromOrigins([...ALL_SITES, ...sitePatterns('a.com')])).toEqual({
      mode: 'all',
      sites: [],
    });
  });

  it('is not All Sites with only one scheme granted', () => {
    expect(accessFromOrigins(['https://*/*']).mode).toBe('on-click');
  });
});
