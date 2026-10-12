# Privacy

FleetFoot Engine does not send your browsing activity anywhere. It has no telemetry, no usage statistics, no accounts, no remote servers, no advertising and no affiliate links.

## What it keeps, and where

Everything stays in the browser's local extension storage on this device. The browser's sync storage is never used, so nothing travels with your browser account.

- Your settings: speeds, keys, the overlay, the theme and the other choices on the options page.
- With "one speed for every site": the last speed you chose.
- With "a speed for every site": for each site you set, its name (such as `example.com`) and the settings you gave it. Never an address, a page, a title or anything you watched.
- With "All Sites": the names of the sites you excluded.
- Time saved: a single total, in seconds.

## What it never does

- It never reads the pages you visit. It looks only for video and audio elements and changes their playback.
- It never records or keeps any sound. With "Skip silences" on, and only then, it listens to the player you are watching to find its pauses, on your device, as the sound plays; nothing of it is stored or sent.
- It never makes a network request. The extension's own pages cannot open a connection, and every release is checked for code that could.
- It opens one page by itself: the welcome page, once, when it is installed. Every other page opens only when you click it: the source code, Issues, Discussions, Ko-fi and the extension's page in the store you installed it from.

## Your control

- Export your settings to a file from the options page. The file stays where you put it.
- Import a file you exported. It is checked before anything is written, and you confirm it first.
- Delete everything FleetFoot Engine keeps on this device from the options page, in two clicks.
- Site permissions are the browser's: you grant and remove them in the options page or in the browser's own settings.
- Removing the extension removes its storage with it.

Each permission and why it is there: [docs/PERMISSIONS.md](docs/PERMISSIONS.md).

## Questions

Ask in [Discussions](https://github.com/beamwarprift/FleetFoot-Engine/discussions). A security problem: see [SECURITY.md](SECURITY.md).
