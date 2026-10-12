// Signs every script of a build with the author's banner once the bundle is final, after
// minification, so the bundler's own output options are left exactly as the framework sets them.

import type { Plugin } from 'vite';

export function signaturePlugin(banner: string): Plugin {
  return {
    name: 'fleetfoot-signature',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type === 'chunk' && !file.code.startsWith(banner)) {
          file.code = `${banner}\n${file.code}`;
        }
      }
    },
  };
}
