# Surge Manage — mobile (Flutter)

The mobile client mirrors the desktop app: it manages a remote `surge` daemon
over a mosh session and presents everything as a **GUI** — it never exposes a
raw shell. Built with [forui](https://forui.dev) (a shadcn-style component
library for Flutter).

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
│   ├── channel.dart          # TerminalChannel abstraction
│   ├── runner.dart           # sentinel-framed structured command runner
│   ├── ssh.dart              # dartssh2 bootstrap + SSH-shell fallback channel
│   ├── mosh/mosh_client.dart # native mosh transport bridge (platform channel)
│   ├── connection.dart       # connection lifecycle orchestration
│   └── secure_store.dart     # hosts + secrets in platform secure storage
├── state/app_state.dart      # ChangeNotifier app state (provider)
└── ui/
    ├── home_page.dart        # shell: host list → tabbed management view
    ├── host_list.dart, host_form.dart
    └── panels/               # dashboard, policies, rules, logs, config
```

## Transport note (mosh on mobile)

mosh's UDP State-Synchronization Protocol needs a native client. The production
path is a platform channel to a bundled `mosh-client` (Android NDK / iOS
libmosh), defined in `core/mosh/mosh_client.dart`. Until that native side is
wired up (`TODO(live)`), the app falls back to an interactive SSH shell as the
transport — the structured-command runner and the entire GUI behave identically
either way; only roaming resilience differs.

## Keeping parity with the desktop client

`lib/core/*.dart` is a hand-maintained mirror of `packages/shared/src/*.ts`.
When you add a surge action, update both `commands.ts`/`commands.dart` and the
matching parser.
