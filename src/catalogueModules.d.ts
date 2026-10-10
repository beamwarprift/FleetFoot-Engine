// The catalogue modules the build makes from `public/_locales` (`scripts/catalogues.ts`).

declare module 'virtual:catalogue-text/*' {
  import type { CatalogueEntry } from './ui/catalogue.ts';

  /** One text in every catalogue that has it, keyed by catalogue name; plain without placeholders. */
  const byCatalogue: Readonly<Record<string, string | CatalogueEntry>>;
  export default byCatalogue;
}

declare module 'virtual:catalogue-loaders' {
  /** Each catalogue's import from the packaged `_locales`, keyed by catalogue name. */
  const loaders: Readonly<Record<string, () => Promise<{ readonly default: unknown }>>>;
  export default loaders;
}
