# TPS Notifier

Two-way notifications for an always-on vault, using `ntfy` for push delivery and Obsidian protocol callbacks for deep linking back into notes.

## Features

- Sends push notifications via `ntfy` (server + topic configured in settings).
- “Controller” vs “receiver” device roles:
  - **controller**: evaluates reminders and sends notifications.
  - **receiver**: does not send (useful when multiple devices sync the same vault).
- Frontmatter-based reminders:
  - Define reminders that watch a specific frontmatter property (e.g., `scheduled`, `due`).
  - Support offsets (before/at/after), repeat behavior, and stop conditions like `status: complete`.
- Exclusions:
  - Ignore paths, tags, and statuses globally.
- Obsidian deep links:
  - Notifications link back into the vault via `obsidian://tps-notifier?...`.
  - If a file isn’t found (sync delay), the handler retries and falls back to listing overdue items.

## How It Works (Technical)

- `src/main.ts` is currently a single-file implementation that:
  - Loads settings and renders a settings tab.
  - Periodically scans markdown files for target frontmatter fields.
  - Tracks per-file/per-reminder alert state in `alertState` to avoid duplicates and manage repeats.
  - Sends notifications via HTTP POST to the configured `ntfy` endpoint.
  - Registers an Obsidian protocol handler (`tps-notifier`) to open target files from notification taps.

## Commands

- `List Overdue Items`
- `Send Notifications` (controller only)

## Development

- Install deps: `npm install`
- Dev build (watch): `npm run dev`
- Prod build: `npm run build`

