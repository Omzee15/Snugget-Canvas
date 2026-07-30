# Snugget Canvas

Snugget Canvas is an Electron-powered desktop workspace built around an
infinite canvas of live windows. Use it to arrange web apps, blank browser
pages, and terminal sessions side by side on a pan/zoom surface that feels more
like a workspace than a tab strip.

## Run

```bash
npm install
npm run dev      # dev mode with hot reload for the UI
npm start        # build renderer + launch
```

## Controls

| Action | How |
| --- | --- |
| Open the create menu | `⇧A`, or "+ Open" in the toolbar |
| Create a web window | choose an app or type a URL in the create menu |
| Create a blank browser page | click the blank-window icon in the create menu |
| Create a terminal | click the terminal icon in the create menu |
| Interact with a screen | click it once to select it (shown top right); only the selected screen receives scroll/click/typing — everywhere else, gestures pan the canvas |
| Groups | "+ New group" under a desktop in the sidebar; assign screens via the dot on each screen row; grouped screens share a thin border of the group color |
| Pan | scroll / drag empty canvas / hold `Space` / hand tool `H` |
| Zoom | `⌘` + scroll (works over app windows too), pinch, `⌘+` `⌘−` `⌘0` |
| Zoom to fit | `⇧1` or the Fit button |
| Move a window | drag its title bar |
| Focus a window | double-click its title bar |
| Multiple desktops | sidebar `+`; double-click a name to rename |
| Delete window | select it, then `⌫` |

## Architecture notes

- Electron + React + Vite. Main/preload are plain CJS (`electron/`), renderer is TS/React (`src/`).
- Web apps run inside `<webview>` windows so iframe-blocked sites still load,
  while terminal sessions are rendered as native canvas windows backed by an
  Electron shell process.
- All webviews share the persistent session partition `persist:apps`, so logins
  survive restarts. Layout state is saved to `snugget-state.json` in userData.
- Windows are z-ordered via a `z` stamp + CSS `z-index` (never DOM reordering —
  moving a `<webview>` in the DOM reloads the app). Same reason `src` is set
  once and navigation updates are tracked via events.
- Inactive desktops stay mounted but hidden, so their apps keep running, like
  real virtual desktops.
- The canvas create menu is the main entry point for opening apps, blank pages,
  and terminals.

## Known limitations

- Google sign-in may complain about the embedded browser on some accounts
  despite the Chrome user-agent override.
- Very many simultaneous windows = many Chromium processes; expect real memory
  usage, exactly like having those tabs open.
