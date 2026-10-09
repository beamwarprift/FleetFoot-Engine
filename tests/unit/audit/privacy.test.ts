import { describe, expect, it } from 'vitest';
import {
  auditRuntimeDependencies,
  classifyFile,
  type NetworkAllowlist,
  scanText,
} from '../../../scripts/audit/privacy.ts';

const EMPTY: NetworkAllowlist = { linkUrls: [], namespaceUris: [] };

function rules(content: string, allowlist: NetworkAllowlist = EMPTY): string[] {
  return scanText('bundle.js', content, allowlist).map((finding) => finding.rule);
}

describe('scanText', () => {
  it('accepts code without network access', () => {
    expect(
      rules('var a=function(e){return e==null||typeof e==`function`};prefetchData(a);'),
    ).toEqual([]);
  });

  it.each([
    ['fetch("/x")', 'network-api:fetch'],
    ['const f=globalThis.fetch;f(u)', 'network-api:fetch'],
    ['new XMLHttpRequest()', 'network-api:XMLHttpRequest'],
    ['new WebSocket(u)', 'network-api:WebSocket'],
    ['new EventSource(u)', 'network-api:EventSource'],
    ['navigator.sendBeacon(u,d)', 'network-api:sendBeacon'],
    ['new WebTransport(u)', 'network-api:WebTransport'],
    ['new RTCPeerConnection()', 'network-api:RTCPeerConnection'],
    ['importScripts("x.js")', 'network-api:importScripts'],
    ['chrome.runtime.connectNative("host")', 'native-messaging'],
    ['window.postMessage({type:t},"*")', 'page-signal:postMessage'],
    ['e.postMessage({a:1,b:[2,3]},`*`)', 'page-signal:postMessage'],
    ['const send=window.postMessage;send(m,o)', 'page-signal:postMessage'],
    ['el.innerHTML=html', 'html-from-string'],
    ['el.outerHTML=html', 'html-from-string'],
    ['el.insertAdjacentHTML("beforeend",h)', 'html-from-string'],
    ['document.write(h)', 'html-from-string'],
    ['new DOMParser().parseFromString(h,t)', 'html-from-string'],
    ['range.createContextualFragment(h)', 'html-from-string'],
    ['frame.srcdoc=h', 'html-from-string'],
    ['const e=id+":content:wxt:content-script-started"', 'page-signal:wxt-started'],
    ['eval(code)', 'dynamic-code:eval'],
    ['new Function("return 1")', 'dynamic-code:Function'],
    ['Function("return 1")()', 'dynamic-code:Function'],
    ['WebAssembly.instantiate(b)', 'wasm'],
    ['const u="https://telemetry.example.com/collect"', 'remote-url'],
    ['const u="wss://example.com/socket"', 'remote-url'],
    ['<script src="//cdn.example.com/x.js"></script>', 'protocol-relative-url'],
  ])('flags %s', (content, rule) => {
    expect(rules(content)).toContain(rule);
  });

  it('allows only exact allowlisted URLs', () => {
    const allowlist: NetworkAllowlist = {
      linkUrls: ['https://github.com/example/repo'],
      namespaceUris: [],
    };
    expect(rules('a.href="https://github.com/example/repo"', allowlist)).toEqual([]);
    expect(rules('a.href="https://github.com/example/repo/track"', allowlist)).toEqual([
      'remote-url',
    ]);
  });
});

describe('classifyFile', () => {
  it('scans code, allows assets and the root manifest, rejects anything else', () => {
    expect(classifyFile('background.js')).toBe('scan');
    expect(classifyFile('popup.html')).toBe('scan');
    expect(classifyFile('icons/icon.svg')).toBe('scan');
    expect(classifyFile('icons/icon-128.png')).toBe('binary');
    expect(classifyFile('manifest.json')).toBe('manifest');
    expect(classifyFile('nested/manifest.json')).toBe('forbidden');
    expect(classifyFile('core.wasm')).toBe('forbidden');
    expect(classifyFile('background.js.map')).toBe('forbidden');
    expect(classifyFile('LICENSE')).toBe('forbidden');
    expect(classifyFile('_locales/en/messages.json')).toBe('scan');
    expect(classifyFile('_locales/pt_BR/messages.json')).toBe('scan');
    expect(classifyFile('_locales/en/other.json')).toBe('forbidden');
    expect(classifyFile('data/messages.json')).toBe('forbidden');
    expect(classifyFile('_locales/en/nested/messages.json')).toBe('forbidden');
  });
});

describe('auditRuntimeDependencies', () => {
  it('accepts a package without runtime dependencies', () => {
    expect(auditRuntimeDependencies({ devDependencies: { wxt: '1.0.0' } })).toEqual([]);
    expect(auditRuntimeDependencies({ dependencies: {} })).toEqual([]);
  });

  it('rejects any runtime dependency', () => {
    expect(auditRuntimeDependencies({ dependencies: { 'analytics-sdk': '1.0.0' } })).not.toEqual(
      [],
    );
    expect(auditRuntimeDependencies({ optionalDependencies: { x: '1.0.0' } })).not.toEqual([]);
  });
});

describe('extension port messaging', () => {
  it('is private: one argument, no target origin', () => {
    expect(rules('port.postMessage(state)')).toEqual([]);
    expect(rules('t.postMessage({a:"x,y",b:f(1,2)})')).toEqual([]);
    expect(rules('t.postMessage(f(a,b))')).toEqual([]);
  });
});
