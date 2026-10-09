// Places on the options page another part of the interface leads to: the page opens there.

/** How LOCK answers a page that fights it. */
export const LOCK_FIGHT_PLACE = 'lock-fight';

/** Skip Silence: on or off, what counts as a silence, its speed. */
export const SKIP_SILENCE_PLACE = 'skip-silence';

/** The options page at `place`, as a link from any page of the extension. */
export function optionsPlaceHref(place: string): string {
  return `/options.html#${encodeURIComponent(place)}`;
}
