# Surge Manage

A cross-platform **remote management client for the [Surge](https://nssurge.com) CLI**, connecting to
remote hosts over **[mosh](https://mosh.org)** (the mobile shell).

Surge Manage gives you a **pure graphical control panel** for a `surge` daemon running on a
remote server: connection status, traffic stats, policy/policy-group switching, rule
inspection, live logs, and configuration viewing — all tunnelled over a roaming-friendly
mosh session.

> **No shell is ever exposed to the user.** The mosh session is an *internal transport*: the
> app runs `surge` CLI subcommands over it, parses their output, and renders the results as
> GUI. The user interacts only with native controls (cards, tables, dropdowns, toggles),
> never a terminal.

## Why mosh?

`mosh` keeps the management session alive across network changes, sleep/wake, and IP
roaming (laptop moving between Wi-Fi/cellular). For a tool you keep open all day to babysit
a proxy node, that resilience matters more than a plain SSH pipe. Surge Manage bootstraps
the mosh session over SSH (`mosh-server new`), then speaks the mosh UDP protocol via
`mosh-client`.

## Repository layout

```
surge-manage/
├── packages/
│   └── shared/        # Framework-agnostic protocol: surge command catalog,
│                      # output parsers, and TypeScript types shared by Electron.
├── electron/          # Desktop app — Electron + React + Vite + Tailwind + shadcn/ui
├── flutter/           # Mobile app — Flutter + forui (shadcn-style) + xterm.dart + dartssh2
├── docs/
│   └── architecture.md
├── pnpm-workspace.yaml
└── package.json
```

The two clients are deliberately independent (different language ecosystems) but share a
**single conceptual protocol**, documented in `docs/architecture.md` and implemented in
`packages/shared` (TypeScript) and mirrored in `flutter/lib/core` (Dart). Keep them in sync
when you change the command catalog.

## Quick start (desktop / Electron)

```bash
corepack enable          # provides pnpm
pnpm install
pnpm --filter @surge-manage/electron dev
```

## Quick start (mobile / Flutter)

```bash
cd flutter
flutter pub get
flutter run
```

## Connection model

1. The client opens an **SSH** connection to the host (key or password auth).
2. It runs `mosh-server new -s -c 256 -l LANG=en_US.UTF-8` and parses the
   `MOSH CONNECT <udp-port> <base64-key>` handshake line.
3. It launches `mosh-client` (desktop: spawned binary via `node-pty`; mobile: a native mosh
   client behind a platform channel) against `<udp-port>` with `MOSH_KEY=<key>` to establish
   the roaming UDP session. **This session is internal** — its raw bytes never reach the UI.
4. **Structured surge commands** are executed inside that session by wrapping them in
   sentinel markers (`__SM_BEGIN__ <id>` … `__SM_END__ <id> <exit-code>`) so output can be
   captured and parsed deterministically. See `packages/shared/src/runner.ts`.
5. Parsed results populate the GUI (dashboard, policies, rules, logs, config). The user never
   sees or types into a shell.

> **Security note:** Surge Manage never stores plaintext passwords. SSH private-key paths
> and host metadata are kept in the OS keychain (desktop) / `flutter_secure_storage`
> (mobile). See the security section in `docs/architecture.md`.

## Status

This is a working scaffold with complete UI, IPC, connection orchestration, and the surge
command/parsing layer. Items requiring real hardware to exercise (a live mosh-enabled host
with a `surge` binary) are marked with `TODO(live)` in the code.

## License

MIT
