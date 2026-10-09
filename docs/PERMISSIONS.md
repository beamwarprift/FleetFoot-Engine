# Permissions

Every permission the extension can hold, and why. The list is enforced: `pnpm audit:manifest` compares the generated manifest of every browser with `config/manifest-policy.json` and fails if anything differs, or if a permission listed here is missing from this file.

## Required at install

| Permission | Why |
|---|---|
| `storage` | Settings live in `storage.local` only. `storage.sync` is never used. |
| `activeTab` | Default "On Click" mode: the extension acts on the current tab only after an explicit user action. |
| `scripting` | Injects the media controller into a tab after that explicit action, or on sites the user allowed. |
| `contextMenus` | Optional right-click menu (Speed → 1× / 1.5× / 2× / Favorite). Enabled by default, can be turned off in Options. |

## Optional, requested only when the user enables a mode

| Host pattern | Why |
|---|---|
| `http://*/*` | "Selected Sites" and "All Sites" modes. Requested per site, or for all sites only when the user picks "All Sites". |
| `https://*/*` | Same as above. |

## Never requested

`<all_urls>`, `history`, `cookies`, `webRequest`, `webRequestBlocking`, `downloads`, `bookmarks`, `topSites`, `management`, `debugger`, `nativeMessaging`, `geolocation`, `tabs`.

These stay forbidden even if someone adds them to the expected manifest: the audit checks them separately.

## Other manifest guarantees

- No static content scripts: nothing runs on a page until the user acts or allows the site.
- No `externally_connectable`: no website can message the extension.
- No `web_accessible_resources`.
- Extension pages run under `connect-src 'none'`: they cannot open network connections.
- Firefox declares `data_collection_permissions: { required: ["none"] }`.

## No permission in silence

A permission cannot be added quietly: every build fails until this file and the expected manifest agree, and the permissions listed above as never requested fail it even then.
