# Architecture

Surge Manage is a remote control panel for a `surge` daemon running on a Linux/macOS host.
It is split into three layers that are reused (conceptually) across both the desktop and
mobile clients.

> **GUI-only.** No raw terminal is shown to the user on either platform. The mosh session
> is an internal transport; the UI renders only parsed, structured data.

```
┌──────────────────────────────────────────────────────────────────┐
│  Presentation (GUI only — no shell)                               │
│   • Electron renderer: React + shadcn/ui + Tailwind                │
│   • Flutter: forui (shadcn-style)                                  │
├──────────────────────────────────────────────────────────────────┤
│  Orchestration                                                     │
│   • Connection lifecycle (SSH bootstrap → mosh session)            │
│   • Structured command runner (sentinel-framed exec)               │
│   • Surge command catalog + output parsers                         │
├──────────────────────────────────────────────────────────────────┤
│  Transport                                                         │
│   • SSH (ssh2 / dartssh2)  — auth + mosh-server bootstrap          │
│   • mosh  (mosh-client via node-pty / Dart mosh client)            │
└──────────────────────────────────────────────────────────────────┘
```

## 1. Transport: SSH → mosh bootstrap

mosh cannot establish a session on its own; it needs an authenticated SSH login to start
`mosh-server` on the remote and hand back a one-time key. The sequence:

1. Open SSH (key-based preferred; password supported) to `user@host:port`.
2. Exec:
   ```
   mosh-server new -s -c 256 -l LANG=en_US.UTF-8
   ```
   This prints, on success:
   ```
   MOSH CONNECT 60001 4NeCCgvZFe2RnPgrcU1PQw
   ```
   (`60001` = chosen UDP port in the mosh port range, second token = base64 session key).
3. Close the SSH exec channel (mosh-server daemonizes).
4. Launch the local mosh client against the host's UDP port:
   ```
   MOSH_KEY=4NeCCgvZFe2RnPgrcU1PQw mosh-client <host-ip> 60001
   ```
   - **Desktop:** spawn the system `mosh-client` binary inside a PTY (`node-pty`).
   - **Mobile:** a native mosh client behind a platform channel (`flutter/lib/core/mosh/`);
     falls back to an SSH interactive shell until the native side is bundled.

The UDP session survives IP changes and susp/resume — that's the whole point of mosh. Its
raw bytes are consumed only by the command runner (below); they are **never forwarded to the
renderer/UI**, so the user never sees a shell.

### Why SSH is still in the picture

SSH is only used for the *bootstrap* and (optionally) as a reliable side-channel for
structured commands when an interactive mosh terminal is not desired. The long-lived
management session is mosh.

## 2. Structured command runner (sentinel framing)

A mosh/PTY session is a stream of bytes meant for a human terminal — there is no built-in
request/response framing. To run `surge` subcommands and reliably capture their output and
exit code, we wrap each command:

```
printf '\n__SM_BEGIN__ %s\n' "$ID"; <command>; printf '\n__SM_END__ %s %s\n' "$ID" "$?"
```

The runner watches the output stream for `__SM_BEGIN__ <id>` and `__SM_END__ <id> <code>`
and returns everything in between as the command result. Concurrent commands are serialized
through a queue so markers never interleave. See:

- TS: `packages/shared/src/runner.ts`
- Dart: `flutter/lib/core/runner.dart`

## 3. Surge command catalog

A single declarative catalog describes every management action: its argv template, whether
it mutates state, and the parser for its output. This keeps both clients' feature sets
identical and makes adding a command a one-liner.

| Action            | Command (default)            | Parser           |
|-------------------|------------------------------|------------------|
| `version`         | `surge --version`            | text             |
| `status`          | `surge status --json`        | JSON → Status    |
| `start`           | `surge start`                | exit-code        |
| `stop`            | `surge stop`                 | exit-code        |
| `restart`         | `surge restart`              | exit-code        |
| `reload`          | `surge reload`               | exit-code        |
| `policies`        | `surge policy list --json`   | JSON → Policy[]  |
| `selectPolicy`    | `surge policy select <g> <p>`| exit-code        |
| `rules`           | `surge rule list --json`     | JSON → Rule[]    |
| `traffic`         | `surge traffic --json`       | JSON → Traffic   |
| `logsTail`        | `surge log --follow`         | stream lines     |
| `configPath`      | `surge config path`          | text             |
| `configShow`      | `surge config show`          | text             |
| `test`            | `surge test <policy>`        | text (latency)   |

> The `surge` binary name, path, and per-command argv are **configurable per connection**
> (`SurgeProfile`) so the catalog adapts to forks/wrappers or a non-standard install.
> Defaults assume a POSIX `surge` in `$PATH`.

The catalog is defined once in `packages/shared/src/commands.ts` and mirrored in
`flutter/lib/core/commands.dart`.

## 4. State & data model

Core entities (see `packages/shared/src/types.ts`):

- **HostConfig** — id, label, host, port, username, auth method, surge profile.
- **SurgeProfile** — binary path + argv overrides for the command catalog.
- **ConnectionState** — `disconnected | sshConnecting | moshBootstrapping | connected | error`.
- **SurgeStatus / Policy / PolicyGroup / Rule / Traffic / LogLine** — parsed domain models.

## 5. Security

- No plaintext passwords on disk. SSH key paths + host metadata are stored in the OS
  keychain (desktop, via `keytar`) and `flutter_secure_storage` (mobile).
- The mosh session key is one-time and held only in memory.
- IPC between Electron renderer and main is funnelled through a typed, allow-listed
  `contextBridge` surface (`electron/src/preload/index.ts`) — the renderer never touches
  Node APIs directly (`contextIsolation: true`, `nodeIntegration: false`).
- Host key verification: on first connect the SSH host fingerprint is pinned (TOFU); a
  changed fingerprint aborts the connection.

## 6. Desktop IPC surface

The renderer talks to the main process exclusively through `window.surge`. Note there is
**no terminal/shell channel** — the renderer cannot read or write the mosh PTY directly.

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
mosh PTY lives entirely in the main process (`electron/src/main/`).
