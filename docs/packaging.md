# Packaging the desktop app

The Electron client is packaged with [electron-builder](https://www.electron.build).
Config lives in `electron/electron-builder.yml`; build resources (icon, mac entitlements)
live in `electron/build/`.

## Prerequisites

- Node ≥ 20 and pnpm (`corepack enable`).
- Internet access on the first run: electron-builder downloads the Electron dist, its
  packaging helpers (AppImage/NSIS tooling), and the headers needed to rebuild the native
  `keytar` module against Electron's ABI.
- Cross-building has the usual electron-builder caveats: build the macOS targets on macOS;
  Windows NSIS can be produced from Linux/macomS via Wine but is most reliable on Windows.

## Commands

Run from `electron/` (or via the root workspace filter):

```bash
pnpm --filter @surge-manage/electron package:dir     # unpacked app (fastest sanity check)
pnpm --filter @surge-manage/electron package:linux   # AppImage + deb
pnpm --filter @surge-manage/electron package:mac      # dmg + zip (arm64 + x64)
pnpm --filter @surge-manage/electron package:win      # NSIS installer (x64)
pnpm --filter @surge-manage/electron package          # current platform, all configured targets
```

Each `package:*` script runs `electron-vite build` first; output lands in `electron/release/`.

## How the monorepo is handled

electron-builder packages an app's *production* `dependencies`. Two adjustments make this
work with the pnpm workspace:

1. **`@surge-manage/shared` is a `devDependency`, not a dependency.** It is bundled directly
   into the main/preload output by Vite (`externalizeDepsPlugin({ exclude: ["@surge-manage/shared"] })`
   in `electron.vite.config.ts`), so the packaged app never needs the workspace symlink.
   The only runtime dependencies are `ssh2` and `keytar`.
2. **`cpu-features` is stripped** (`.pnpmfile.cjs`). It is an optional native add-on of
   `ssh2` that only provides an AES-NI perf hint; removing it avoids an extra native compile
   during packaging. `keytar` remains and is rebuilt automatically against Electron's ABI.

## Native modules in the asar

`keytar` is a native `.node` addon and cannot run from inside the asar archive, so it is
unpacked via `asarUnpack` (see the config). You'll find it at
`resources/app.asar.unpacked/node_modules/keytar/build/Release/keytar.node` in the packaged
app.

## Icon

`electron/build/icon.png` (1024×1024) is the single source icon; electron-builder derives the
platform formats (`.icns`, `.ico`) from it. Regenerate the placeholder with
`pnpm --filter @surge-manage/electron make-icon`, or replace the PNG with real artwork.

## Verified

`electron-builder --linux dir` and `--linux AppImage` were run successfully in development:
`keytar` rebuilds against Electron 33, the Electron dist is fetched, and the unpacked app +
AppImage are produced under `electron/release/`. Building the `.deb`, macOS, and Windows
targets follows the same flow and only needs the corresponding host/tooling.
