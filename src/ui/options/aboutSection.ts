// About: the version and its licence, the author, the source of this very version, where to
// report a problem or ask, the support link and «More from the developer». Plain links, opened
// only on the user's click.

import { AUTHOR } from '../author.ts';
import { h } from '../dom.ts';
import {
  DEVELOPER_LINKS,
  DISCUSSIONS_URL,
  externalLink,
  ISSUES_URL,
  SUPPORT_URL,
  versionLicenseUrl,
  versionSourceUrl,
} from '../links.ts';
import type { OptionsSection, SectionDeps } from './section.ts';

export interface AboutDeps extends SectionDeps {
  /** The version this build carries, from its manifest. */
  readonly version: string;
}

export function aboutSection(deps: AboutDeps): OptionsSection {
  const { document, fields, version } = deps;
  const { t } = deps.l10n;
  const item = (text: string, href: string, className?: string) =>
    h(document, 'li', {}, [externalLink(document, text, href, className)]);
  const more =
    DEVELOPER_LINKS.length === 0
      ? null
      : h(document, 'div', { className: 'group' }, [
          h(document, 'h3', { text: t('moreFromDeveloper') }),
          h(
            document,
            'ul',
            { className: 'links' },
            DEVELOPER_LINKS.map((link) => item(t(link.label), link.url)),
          ),
        ]);
  return {
    element: fields.section('sectionAbout', [
      h(document, 'p', { text: t('aboutVersion', version) }),
      h(document, 'p', { text: t('aboutAuthor', AUTHOR) }),
      h(document, 'p', { text: t('aboutLicense') }),
      h(document, 'ul', { className: 'links' }, [
        item(t('aboutSource'), versionSourceUrl(version)),
        item(t('aboutLicenseLink'), versionLicenseUrl(version)),
        item(t('aboutIssues'), ISSUES_URL),
        item(t('aboutDiscussions'), DISCUSSIONS_URL),
        item(t('supportDevelopmentKofi'), SUPPORT_URL, 'support'),
      ]),
      more,
    ]),
    refresh() {},
    stop() {},
  };
}
