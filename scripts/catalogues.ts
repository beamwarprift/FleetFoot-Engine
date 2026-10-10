// The catalogues of `public/_locales` as the code reads them, built from the folders at build
// time, so one more folder is one more language with nothing else to write:
// - `virtual:catalogue-text/<key>`: one text in every catalogue, keyed by catalogue name, without
//   the notes for translators, a text without placeholders as a plain string. The page script
//   and the background carry only these.
// - `virtual:catalogue-loaders`: for each catalogue, its import as a JSON module from the
//   packaged `_locales` file, the one the browser reads, so no text is packed twice.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';

const TEXT = 'virtual:catalogue-text/';
const LOADERS = 'virtual:catalogue-loaders';
/** The packaged file a loader imports: left to the browser, never bundled. */
const PACKAGED = /^\/_locales\/[a-zA-Z_]+\/messages\.json$/;

interface Entry {
  readonly message: string;
  readonly description?: string;
  readonly placeholders?: Readonly<Record<string, unknown>>;
}

export function cataloguesPlugin(root: string): Plugin {
  const folder = join(root, 'public/_locales');
  const names = () =>
    readdirSync(folder, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  const fileOf = (name: string) => join(folder, name, 'messages.json');
  let serving = false;
  return {
    name: 'fleetfoot-catalogues',
    enforce: 'pre',
    configResolved(config) {
      serving = config.command === 'serve';
    },
    resolveId(id) {
      if (id.startsWith(TEXT) || id === LOADERS) return `\0${id}`;
      if (PACKAGED.test(id)) return { id, external: true };
      return null;
    },
    load(id) {
      if (id === `\0${LOADERS}`) {
        // Left to the browser, never bundled. A build writes each path whole, as a store's review
        // asks; the test server, which refuses imports from `public`, gets it put together.
        const loaders = names().map((name) => {
          const path = serving
            ? `['/_locales', ${JSON.stringify(name)}, 'messages.json'].join('/')`
            : JSON.stringify(`/_locales/${name}/messages.json`);
          return `${JSON.stringify(name)}: () => import(/* @vite-ignore */ ${path}, { with: { type: 'json' } })`;
        });
        return `export default {\n${loaders.join(',\n')}\n};`;
      }
      if (!id.startsWith(`\0${TEXT}`)) return null;
      const key = id.slice(TEXT.length + 1);
      const byCatalogue: Record<string, string | Omit<Entry, 'description'>> = {};
      for (const name of names()) {
        this.addWatchFile(fileOf(name));
        const entry = (JSON.parse(readFileSync(fileOf(name), 'utf8')) as Record<string, Entry>)[
          key
        ];
        if (entry === undefined) continue;
        const { description: _, ...text } = entry;
        byCatalogue[name] = text.placeholders === undefined ? text.message : text;
      }
      return `export default ${JSON.stringify(byCatalogue)};`;
    },
  };
}
