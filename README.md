# Surge Manage

A cross-platform **remote management client for the [Surge](https://nssurge.com) CLI**, connecting to
remote hosts over **SSH**.

Surge Manage gives you a **pure graphical control panel** for a `surge` daemon running on a
remote server: connection status, traffic stats, policy/policy-group switching, rule
inspection, live logs, and configuration viewing.

> **No shell is ever exposed to the user.** The SSH connection is an *internal transport*: the
> app runs `surge` CLI subcommands over it, parses their output, and renders the results as
> GUI. The user interacts only with native controls (cards, tables, dropdowns, toggles),
> never a terminal.

## How it connects

The app opens an SSH connection (key / password / agent) and runs each `surge` subcommand
with a one-shot `exec` channel, which returns clean stdout and an exit code per command —
no PTY, no output framing required. Live logs use a long-lived `surge log --follow` exec
session whose stdout is parsed line-by-line.

## Repository layout

```
surge-manage/
├── packages/
│   └── shared/        # Framework-agnostic protocol: surge command catalog,
│                      # output parsers, and TypeScript types shared by Electron.
├── electron/          # Desktop app — Electron + React + Vite + Tailwind + shadcn/ui
├── flutter/           # Mobile app — Flutter + forui (shadcn-style) + dartssh2
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

1. The client opens an **SSH** connection to the host (key / password / agent auth).
2. **Structured surge commands** run via a one-shot `exec` per action
   (`surge status --json`, `surge policy select …`, etc.); stdout and the exit code are
   captured directly. See `electron/src/main/ssh.ts` and `flutter/lib/core/ssh.dart`.
3. Output is parsed into domain models (`packages/shared/src/parsers.ts`) and rendered as
   GUI. The user never sees or types into a shell.
4. **Live logs** stream from a long-lived `surge log --follow` exec channel, parsed
   line-by-line into `LogLine` events.

> **Security note:** Surge Manage never stores plaintext passwords. SSH private-key paths
> and host metadata are kept in the OS keychain (desktop) / `flutter_secure_storage`
> (mobile). See the security section in `docs/architecture.md`.

## Status

This is a working scaffold with complete UI, IPC, connection orchestration, and the surge
command/parsing layer. Items requiring real hardware to exercise (a live host with a `surge`
binary) are marked with `TODO(live)` in the code.

## License

MIT
