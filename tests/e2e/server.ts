// The local HTTP server of the end-to-end suites, in Chromium and in Firefox alike: the pages of
// tests/fixtures, a generated tone, and a count of every hit. The server is the ground truth for
// "did a request leave the browser".

import { existsSync, readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';

const FIXTURES_DIR = join(import.meta.dirname, '../fixtures');

export interface LocalServer {
  readonly origin: string;
  readonly hits: string[];
}

/** Seconds of tone, then of digital silence, in turn: speech and its pauses for Skip Silence. */
export const PATTERN = { sound: 1, silence: 1.5 } as const;

/** A one-minute WAV tone, built here so the fixtures carry no media file; or the pattern. */
function toneWav(seconds = 60, sampleRate = 8000, pattern: typeof PATTERN | null = null): Buffer {
  const samples = seconds * sampleRate;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index++) {
    const time = index / sampleRate;
    const quiet = pattern !== null && time % (pattern.sound + pattern.silence) >= pattern.sound;
    buffer.writeInt16LE(
      quiet ? 0 : Math.round(Math.sin(time * 2 * Math.PI * 440) * 2000),
      44 + index * 2,
    );
  }
  return buffer;
}

const PAGES: Readonly<Record<string, string>> = {
  '/video.html':
    '<!doctype html><meta charset="utf-8"><title>video</title><body><video src="/tone.wav" muted style="width:640px;height:360px"></video>',
  '/frame.html':
    '<!doctype html><meta charset="utf-8"><title>frame</title><body><iframe src="/video.html" style="width:700px;height:420px"></iframe>',
};

/** The local pages of tests/fixtures: one name each, letters and dashes only. */
const FIXTURE_PAGE = /^\/fixtures\/([a-z-]+)\.html$/;
/** A page that forbids everything but its own media, as the strictest sites do. */
const STRICT_CSP = "default-src 'none'; media-src 'self'";

export function startServer(): Promise<{ server: Server; local: LocalServer }> {
  const tone = toneWav();
  const pattern = toneWav(60, 8000, PATTERN);
  const hits: string[] = [];
  const server = createServer((request, response) => {
    const url = request.url ?? '/';
    hits.push(url);
    // A query only tells two media files apart; the server answers by path.
    const path = url.split('?')[0] ?? '/';
    const fixture = FIXTURE_PAGE.exec(path)?.[1];
    if (fixture !== undefined && existsSync(join(FIXTURES_DIR, `${fixture}.html`))) {
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        ...(fixture.startsWith('csp-') ? { 'content-security-policy': STRICT_CSP } : {}),
      });
      response.end(readFileSync(join(FIXTURES_DIR, `${fixture}.html`)));
      return;
    }
    const page = PAGES[path];
    if (page !== undefined) {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(page);
      return;
    }
    if (path === '/tone.wav' || path === '/pattern.wav') {
      const wav = path === '/tone.wav' ? tone : pattern;
      response.writeHead(200, { 'content-type': 'audio/wav', 'content-length': wav.length });
      response.end(wav);
      return;
    }
    if (path === '/blank.html') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(readFileSync(join(FIXTURES_DIR, 'blank.html')));
      return;
    }
    response.writeHead(204);
    response.end();
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, local: { origin: `http://127.0.0.1:${port}`, hits } });
    });
  });
}
