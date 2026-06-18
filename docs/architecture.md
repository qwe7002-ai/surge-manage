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

A single declarative catalog maps each action 1:1 onto a real **Surge CLI** command
(`surge-cli`). Query actions add the global `--raw` flag for JSON output.

| Action                  | Command (default)             | Parser              |
|-------------------------|-------------------------------|---------------------|
| `environment`           | `surge-cli --raw environment` | JSON → Environment  |
| `dumpPolicy`            | `surge-cli --raw dump policy` | JSON → PolicyDump   |
| `dumpRule`              | `surge-cli --raw dump rule`   | JSON → Rule[]       |
| `dumpActive`            | `surge-cli --raw dump active` | JSON → Connection[] |
| `dumpRequest`           | `surge-cli --raw dump request`| JSON                |
| `dumpDns`               | `surge-cli --raw dump dns`    | JSON                |
| `dumpProfileEffective`  | `surge-cli dump profile effective` | text           |
| `dumpProfileOriginal`   | `surge-cli dump profile original`  | text           |
| `reload`                | `surge-cli reload`            | exit-code           |
| `stop`                  | `surge-cli stop`              | exit-code           |
| `switchProfile`         | `surge-cli switch-profile <n>`| exit-code           |
| `watchRequest`          | `surge-cli watch request`     | stream lines        |
| `testNetwork`           | `surge-cli test-network`      | text                |
| `testPolicy`            | `surge-cli test-policy <n>`   | JSON → PolicyTest   |
| `testAllPolicies`       | `surge-cli test-all-policies` | JSON → PolicyTest[] |
| `testGroup`             | `surge-cli test-group <n>`    | JSON → PolicyTest[] |
| `flushDns`              | `surge-cli flush dns`         | exit-code           |
| `diagnostics`           | `surge-cli diagnostics`       | text                |
| `kill`                  | `surge-cli kill <id>`         | exit-code           |
| `setLogLevel`           | `surge-cli set-log-level <l>` | exit-code           |
| `setEnvironment`        | `surge-cli set <key> <value>` | exit-code           |

Real `--raw` shapes (from the Surge CLI):

```jsonc
// dump policy
{"proxies":["UK","US",...],"policy-groups":["Relay","Apple",...]}
// test-all-policies
{"UK":{"tcp":66,"receive":415,"available":69,"round-one-total":1055},
 "CA":{"error":"Socket closed by remote peer","available":0}}
```

> The binary name/path is **configurable per connection** (`SurgeProfile.bin`). The default
> is `surge-cli`; on macOS the full path is usually
> `/Applications/Surge.app/Contents/Applications/surge-cli`. Surge also has its own
> `--remote password@host:port` flag, which can be added via `SurgeProfile` argv overrides if
> you prefer Surge's native remote channel over the SSH transport.

The catalog is defined once in `packages/shared/src/commands.ts` and mirrored in
`flutter/lib/core/commands.dart`.

## 3. State & data model

Core entities (see `packages/shared/src/types.ts`):

- **HostConfig** — id, label, host, port, username, auth method, surge profile, and an
  optional `configDir` (Surge's profile directory on the remote, used to list/switch profiles).
- **SurgeProfile** — binary path + argv overrides for the command catalog.
- **ConnectionState** — `disconnected | connecting | connected | error`.
- **Environment / PolicyDump / PolicyTest / Rule / ActiveConnection / Traffic / LogLine** —
  parsed domain models.

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
window.surge.profiles.list()                    // *.conf names in configDir (via ls)
window.surge.logs.start() / stop()              // begin/end parsed request streaming
window.surge.logs.onLine(cb)                    // parsed LogLine events
```

### Feature coverage

Beyond inspection, the UI drives Surge's mutating commands: outbound mode
(`set ProxyMode`), policy-group selection (`set ProxyGroupSelection.<g>=<p>`), feature
toggles (`set MitMEnabled|RewriteEnabled|ScriptingEnabled|Replica`), live connection
killing (`kill <id>` from the Connections tab), profile switching (`switch-profile`, with
the candidate list read from `configDir`), DNS flush, diagnostics, and log-level changes.

All channels are defined in `packages/shared/src/ipc.ts` and validated on both ends. The
SSH connection lives entirely in the main process (`electron/src/main/`).
