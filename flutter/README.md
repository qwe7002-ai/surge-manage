# Surge Manage — mobile (Flutter)

The mobile client mirrors the desktop app: it manages a remote `surge` daemon
over **SSH** and presents everything as a **GUI** — it never exposes a raw
shell. Built with [forui](https://forui.dev) (a shadcn-style component library
for Flutter).

## Run

```bash
flutter pub get
flutter run
flutter test          # unit tests for the command runner & parsers
```

## Structure

```
lib/
├── main.dart                 # app entry, forui theme
├── core/                     # transport + protocol (mirror of packages/shared)
│   ├── types.dart            # domain model
│   ├── commands.dart         # surge command catalog + safe command builder
│   ├── parsers.dart          # output → domain models
│   ├── ssh.dart              # dartssh2 connect + exec helpers
│   ├── connection.dart       # connection lifecycle, runs surge via SSH exec
│   └── secure_store.dart     # hosts + secrets in platform secure storage
├── state/app_state.dart      # ChangeNotifier app state (provider)
└── ui/
    ├── home_page.dart        # shell: host list → tabbed management view
    ├── host_list.dart, host_form.dart
    └── panels/               # dashboard, policies, rules, logs, config
```

## Transport

The app connects over SSH (`dartssh2`) and runs each `surge` subcommand with
`SSHClient.execute`, which yields clean stdout and an exit code per command — no
PTY, no output framing. Live logs use a long-lived `surge log --follow` exec
session whose stdout is parsed line-by-line.

## Keeping parity with the desktop client

`lib/core/*.dart` is a hand-maintained mirror of `packages/shared/src/*.ts`.
When you add a surge action, update both `commands.ts`/`commands.dart` and the
matching parser.
