// Firefox with an extension build installed, driven over WebDriver BiDi (Playwright loads
// extensions only in Chromium). Headless, a fresh profile each time, the extension installed
// temporarily, as Firefox allows for an unsigned one. The client has no dependency: Node's own
// WebSocket. The extension's UUID is fixed in the profile so its pages have a known address.

import { type ChildProcess, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EXTENSION_ID = 'fleetfoot-engine@ffe';
const UUID = '3b8f5a2c-1d4e-4f6a-9b7c-2e1f0a9d8c7b';
/** Longest wait for one answer from the browser. Chosen bound. */
const ANSWER_MS = 20_000;

interface Answer {
  readonly id?: number;
  readonly type?: string;
  readonly result?: Record<string, unknown>;
  readonly error?: string;
  readonly message?: string;
}

export interface Firefox {
  /** The extension's own page at `path`, e.g. `/options.html`. */
  readonly extensionUrl: (path: string) => string;
  /** A new tab at `url`, loaded. */
  open(url: string): Promise<string>;
  /** Evaluates `expression` in the tab, awaiting a promise; throws what it throws. */
  evaluate(context: string, expression: string): Promise<unknown>;
  /** A real click near the top-left corner of the tab: the gesture a browser asks before audio. */
  click(context: string): Promise<void>;
  close(): void;
}

function listening(browser: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = '';
    browser.stderr?.on('data', (chunk: Buffer) => {
      output += chunk.toString();
      const match = /WebDriver BiDi listening on (ws:\/\/\S+)/.exec(output);
      if (match?.[1] !== undefined) resolve(match[1]);
    });
    browser.on('exit', (code) => reject(new Error(`Firefox exited (${code}): ${output}`)));
  });
}

/** A remote value as plain data: strings, numbers, booleans, null and undefined. */
function plain(value: unknown): unknown {
  const remote = value as { type?: string; value?: unknown } | undefined;
  return remote?.type === 'undefined' ? undefined : remote?.value;
}

export async function launchFirefox(binary: string, extensionDir: string): Promise<Firefox> {
  const profile = mkdtempSync(join(tmpdir(), 'ffe-firefox-'));
  writeFileSync(
    join(profile, 'user.js'),
    `user_pref("extensions.webextensions.uuids", ${JSON.stringify(JSON.stringify({ [EXTENSION_ID]: UUID }))});\n`,
  );
  // System access lets the session navigate to the extension's own pages.
  const browser = spawn(
    binary,
    [
      '--headless',
      '--remote-allow-system-access',
      '--remote-debugging-port=0',
      '--profile',
      profile,
      '--no-remote',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  // biome-ignore lint/style/noRestrictedGlobals: the test's control channel to its local Firefox, never shipped.
  const socket = new WebSocket(`${await listening(browser)}/session`);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let next = 0;
  const waiting = new Map<number, (answer: Answer) => void>();
  socket.addEventListener('message', (event) => {
    const answer = JSON.parse(String(event.data)) as Answer;
    if (answer.id !== undefined) waiting.get(answer.id)?.(answer);
  });
  const send = (method: string, params: Record<string, unknown>) =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      next += 1;
      const id = next;
      const late = setTimeout(() => reject(new Error(`${method}: no answer`)), ANSWER_MS);
      waiting.set(id, (answer) => {
        clearTimeout(late);
        waiting.delete(id);
        if (answer.type === 'error')
          reject(new Error(`${method}: ${answer.error} ${answer.message}`));
        else resolve(answer.result ?? {});
      });
      socket.send(JSON.stringify({ id, method, params }));
    });

  await send('session.new', { capabilities: {} });
  await send('webExtension.install', { extensionData: { type: 'path', path: extensionDir } });
  return {
    extensionUrl: (path) => `moz-extension://${UUID}${path}`,
    async open(url) {
      const { context } = (await send('browsingContext.create', { type: 'tab' })) as {
        context: string;
      };
      await send('browsingContext.navigate', { context, url, wait: 'complete' });
      return context;
    },
    async click(context) {
      const press = [
        { type: 'pointerMove', x: 20, y: 20 },
        { type: 'pointerDown', button: 0 },
        { type: 'pointerUp', button: 0 },
      ];
      await send('input.performActions', {
        context,
        actions: [{ type: 'pointer', id: 'mouse', actions: press }],
      });
    },
    async evaluate(context, expression) {
      const outcome = (await send('script.evaluate', {
        expression,
        target: { context },
        awaitPromise: true,
      })) as { type: string; result?: unknown; exceptionDetails?: { text?: string } };
      if (outcome.type === 'exception') throw new Error(outcome.exceptionDetails?.text ?? 'thrown');
      return plain(outcome.result);
    },
    close() {
      socket.close();
      browser.kill();
      rmSync(profile, { recursive: true, force: true });
    },
  };
}
