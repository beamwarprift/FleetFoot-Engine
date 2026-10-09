// Which site a setting belongs to. A site is the hostname of the frame that holds the player,
// lowercase, without a leading `www.`: never a full address, a path or a title.

/** The schemes of a web page: the only addresses a site comes from. */
export const WEB_SCHEMES = ['http', 'https'] as const;
/** A bare name typed by the user is read as a secure address. */
const DEFAULT_SCHEME: (typeof WEB_SCHEMES)[number] = 'https';
const isWebProtocol = (protocol: string): boolean =>
  WEB_SCHEMES.some((scheme) => protocol === `${scheme}:`);

/** DNS limits: 253 characters in all, 63 per label. */
const MAX_HOST_LENGTH = 253;
const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
const IPV4 = /^(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const IPV6 = /^\[[0-9a-f:.]+\]$/;

function isHostname(host: string): boolean {
  if (host.length === 0 || host.length > MAX_HOST_LENGTH) return false;
  if (IPV4.test(host) || IPV6.test(host)) return true;
  // One label is a site too: `localhost` or a home media server on the local network.
  return host.split('.').every((label) => LABEL.test(label));
}

/** The site of a hostname as the browser gives it (`location.hostname`), or null when it has none. */
export function siteOf(hostname: string): string | null {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  const site = host.startsWith('www.') ? host.slice(4) : host;
  return isHostname(site) ? site : null;
}

/**
 * Longest text the site field accepts: a whole pasted address, tracking parameters included. RFC 9110
 * §4.1 asks every sender and recipient to support addresses of at least 8000 octets.
 */
export const SITE_INPUT_MAX_LENGTH = 8000;

/**
 * A site typed or pasted by the user: a bare hostname or an address. Anything else, including
 * credentials, ports and non-web schemes, is not a site.
 */
export function parseSiteInput(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > SITE_INPUT_MAX_LENGTH || /\s/.test(trimmed)) {
    return null;
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
    ? trimmed
    : `${DEFAULT_SCHEME}://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (!isWebProtocol(url.protocol)) return null;
  if (url.username !== '' || url.password !== '' || url.port !== '') return null;
  return siteOf(url.hostname);
}

// Match patterns for a site and its subdomains, one per web scheme: each falls inside one of the
// optional host permissions the manifest declares, one per scheme (`ALL_SITES`).
export function sitePatterns(site: string): string[] {
  const hosts = IPV4.test(site) || IPV6.test(site) ? [site] : [site, `*.${site}`];
  return hosts.flatMap((host) => WEB_SCHEMES.map((scheme) => `${scheme}://${host}/*`));
}

const PATTERN = new RegExp(`^(?:${WEB_SCHEMES.join('|')}):\\/\\/(?:\\*\\.)?([^/*]+)\\/\\*$`);

/** The site a match pattern names, or null for a pattern that names no single site. */
export function siteOfPattern(pattern: string): string | null {
  const match = PATTERN.exec(pattern);
  if (match === null) return null;
  const site = match[1] ?? '';
  return siteOf(site) === site ? site : null;
}
