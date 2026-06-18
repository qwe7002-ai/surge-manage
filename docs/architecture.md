# Architecture

Surge Manage is a remote control panel for a `surge` daemon running on a Linux/macOS host.
It is split into three layers that are reused (conceptually) across both the desktop and
mobile clients.

> **GUI-only.** No raw terminal is shown to the user on either platform. The SSH connection
> is an internal transport; the UI renders only parsed, structured data.

```
┌──────────────────────────────────────────────────────────────────┐
│  Presentation (GUI only — no shell)                               │
│   • Electron renderer: React + shadcn/ui + Tailwind                │
│   • Flutter: forui (shadcn-style)                                  │
├──────────────────────────────────────────────────────────────────┤
│  Orchestration                                                     │
│   • Connection lifecycle (SSH connect / disconnect)                │
│   • Per-command exec + output parsing                              │
│   • Surge command catalog + output parsers                         │
├──────────────────────────────────────────────────────────────────┤
│  Transport                                                         │
│   • SSH (ssh2 / dartssh2) — auth + per-command exec + log stream   │
└──────────────────────────────────────────────────────────────────┘
```

## 1. Transport: SSH

The client opens one authenticated SSH connection per host (key / password / agent) and
keeps it open for the session:

1. Open SSH to `user@host:port`.
2. For each management action, run a **one-shot `exec`** of the resolved command line
   (`surge status --json`, `surge policy select …`). SSH `exec` returns the command's stdout,
   stderr, and exit code natively — no PTY and no output framing are needed.
3. For live logs, open a **long-lived `exec`** of `surge log --follow` and parse its stdout
   stream line-by-line; closing the channel (and sending `SIGINT`) stops it.

The SSH byte stream is consumed only by the orchestration layer; it is **never forwarded to
the renderer/UI**, so the user never sees a shell.

Implementation: `electron/src/main/ssh.ts` (node `ssh2`) and `flutter/lib/core/ssh.dart`
(`dartssh2`). Each exposes `connectSsh`, `exec`, and a streaming helper.

## 2. Surge command catalog

A single declarative catalog describes every management action: its argv template, whether
it mutates state, and the parser for its output. This keeps both clients' feature sets
identical and makes adding a command a one-liner.

| Action            | Command (default)             | Parser           |
|-------------------|-------------------------------|------------------|
| `version`         | `surge --version`             | text             |
| `status`          | `surge --raw status`          | JSON → Status    |
| `start`           | `surge start`                 | exit-code        |
| `stop`            | `surge stop`                  | exit-code        |
| `restart`         | `surge restart`               | exit-code        |
| `reload`          | `surge reload`                | exit-code        |
| `policies`        | `surge --raw policy list`     | JSON → Policy[]  |
| `selectPolicy`    | `surge policy select <g> <p>` | exit-code        |
| `rules`           | `surge --raw rule list`       | JSON → Rule[]    |
| `traffic`         | `surge --raw traffic`         | JSON → Traffic   |
| `logsTail`        | `surge log --follow`          | stream lines     |
| `configPath`      | `surge config path`           | text             |
| `configShow`      | `surge config show`           | text             |
| `test`            | `surge test <policy>`         | text (latency)   |

> `--raw` is a global flag (placed right after the binary) that makes `surge` emit
> machine-readable output for the query commands; the parsers in `parsers.ts` consume it.

> The `surge` binary name, path, and per-command argv are **configurable per connection**
> (`SurgeProfile`) so the catalog adapts to forks/wrappers or a non-standard install.
> Defaults assume a POSIX `surge` in `$PATH`.

The catalog is defined once in `packages/shared/src/commands.ts` and mirrored in
`flutter/lib/core/commands.dart`.

## 3. State & data model

Core entities (see `packages/shared/src/types.ts`):

- **HostConfig** — id, label, host, port, username, auth method, surge profile.
- **SurgeProfile** — binary path + argv overrides for the command catalog.
- **ConnectionState** — `disconnected | connecting | connected | error`.
- **SurgeStatus / Policy / PolicyGroup / Rule / Traffic / LogLine** — parsed domain models.

## 4. Security

- No plaintext passwords on disk. SSH key paths + host metadata are stored in the OS
  keychain (desktop, via `keytar`) and `flutter_secure_storage` (mobile).
- Secrets (passwords / key passphrases) live in the keychain and are read into memory only
  at connect time.
- IPC between Electron renderer and main is funnelled through a typed, allow-listed
  `contextBridge` surface (`electron/src/preload/index.ts`) — the renderer never touches
  Node APIs directly (`contextIsolation: true`, `nodeIntegration: false`).
- Host key verification: on first connect the SSH host fingerprint is pinned (TOFU); a
  changed fingerprint aborts the connection.

## 5. Desktop IPC surface

The renderer talks to the main process exclusively through `window.surge`. Note there is
**no terminal/shell channel** — the renderer cannot read or write the SSH stream directly.

```ts
window.surge.hosts.list()                       // HostConfig[]
window.surge.hosts.save(host)                   // upsert
window.surge.hosts.remove(id)
window.surge.hosts.setSecret(ref, value)        // → OS keychain
window.surge.connection.connect(hostId)
window.surge.connection.disconnect()
window.surge.connection.onState(cb)             // ConnectionState changes
window.surge.surge.run(action, args?)           // structured command → CommandResult
window.surge.logs.start() / stop()              // begin/end parsed log streaming
window.surge.logs.onLine(cb)                    // parsed LogLine events
```

All channels are defined in `packages/shared/src/ipc.ts` and validated on both ends. The
SSH connection lives entirely in the main process (`electron/src/main/`).
