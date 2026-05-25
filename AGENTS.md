# virta — Pebble Alloy (Moddable XS)

A Pebble app with embedded JavaScript running on the watch via Moddable XS, alongside C glue code and PebbleKit JS (phone-side proxy).

## Environment

- **Dev shell**: Nix flake (`flake.nix` + `moddable-tools.nix`). `.envrc` does `use flake`; requires Nix with flakes enabled.
- **No npm scripts, no tests, no linter, no formatter** configured.

## Build & Deploy

```sh
pebble build                          # builds emery + gabbro simultaneously
pebble install --emulator emery     # install to emulator
pebble install --phone <ip>           # install to paired phone
pebble logs                           # stream watch logs
```

- Supported targets: **emery** (Pebble Time 2) and **gabbro** (Pebble Round 2) only.
- Build artifacts land in `build/` (PBW at `build/virta.pbw`, per-platform mods at `build/mods/<platform>/mc.xsa`).

## Architecture & Entrypoints

| Layer | Path | Role |
|-------|------|------|
| C runtime glue | `src/c/mdbl.c` | Boots `moddable_createMachine()` inside a Pebble window |
| Watch JS | `src/embeddedjs/main.ts` | Main app logic; UI via `piu/MC` framework |
| Watch manifest | `src/embeddedjs/manifest.json` | Moddable manifest; imports `$(MODDABLE)/examples/manifest_*.json` |
| Phone JS | `src/pkjs/index.js` | PebbleKit JS proxy using `@moddable/pebbleproxy` |
| Package meta | `package.json` | Pebble metadata (`pebble.*`), UUID, targetPlatforms |
| Build rules | `wscript` | Standard Pebble waf build; rarely needs edits |

## TypeScript

- The **root `tsconfig.json` is editor-only** (`"noEmit": true`). The Pebble build system generates its own internal tsconfig and invokes `tsc` during `pebble build`.
- Type roots map Moddable SDK modules (`piu/MC`, `pebble/button`, `fetch`, `url`, etc.) to local `types/*.d.ts` stubs.
- `watch` is a global in embedded JS (see `pebble/global` typings).

## PKJS Constraints

- **PKJS must use CommonJS `require()`**, not ES modules. `src/pkjs/index.js` uses:
  ```js
  const moddableProxy = require("@moddable/pebbleproxy");
  ```
- `@moddable/pebbleproxy` bridges HTTP, WebSocket, and Location from the watch to the phone. If you add custom PKJS message handling, wrap it around `moddableProxy.appMessageReceived(e)`.

## Framework Notes

- UI is built with **Pebble Moddable (`piu/MC`)**: `Application`, `Column`, `Row`, `Label`, `Skin`, `Style`, `Image`, etc.
- Hardware buttons use `pebble/button` (not legacy Pebble C APIs from JS).
- Network requests on the watch use standard `fetch()` / `URL` / `URLSearchParams` (provided by Moddable web polyfills); the proxy forwards them over the phone connection.
- `console.log` output appears in `pebble logs`.

## Gotchas

- Do **not** run `tsc` manually to compile `src/embeddedjs/main.ts`; the Pebble SDK handles transpilation and XSA archive generation.
- Adding a new `src/embeddedjs/**/*.ts` file may require updating `src/embeddedjs/manifest.json` modules map or the root `tsconfig.json` `include` array.
- `resources/` is empty currently; media assets go there and are declared in `package.json` `pebble.resources.media`.
