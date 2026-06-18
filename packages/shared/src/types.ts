/**
 * Core domain model shared between the Electron main process and renderer.
 * The Flutter client mirrors these shapes in `flutter/lib/core/types.dart`.
 */

export type AuthMethod = "key" | "password" | "agent";

/** How to reach a host and authenticate the SSH bootstrap leg. */
export interface HostConfig {
  id: string;
  /** Human-friendly name shown in the host list. */
  label: string;
  host: string;
  port: number;
  username: string;
  auth: AuthMethod;
  /** Absolute path to the private key when `auth === "key"`. */
  privateKeyPath?: string;
  /**
   * Reference (not the secret itself) to a password/passphrase stored in the OS
   * keychain. The plaintext never lives in config.
   */
  secretRef?: string;
  /** Overrides for how the `surge` binary is invoked on this host. */
  surge: SurgeProfile;
  /** Extra args passed to `mosh-server new` (e.g. locale, port range). */
  moshServerArgs?: string[];
  createdAt: number;
  lastConnectedAt?: number;
}

/** Per-host customisation of the surge command catalog. */
export interface SurgeProfile {
  /** Binary name or absolute path. Default: "surge". */
  bin: string;
  /**
   * Optional argv overrides keyed by {@link SurgeAction}. When present, replaces
   * the default argv template for that action (the leading `bin` is implied).
   */
  argv?: Partial<Record<SurgeAction, string[]>>;
}

export type SurgeAction =
  | "version"
  | "status"
  | "start"
  | "stop"
  | "restart"
  | "reload"
  | "policies"
  | "selectPolicy"
  | "rules"
  | "traffic"
  | "logsTail"
  | "configPath"
  | "configShow"
  | "test";

export type ConnectionPhase =
  | "disconnected"
  | "sshConnecting"
  | "moshBootstrapping"
  | "connected"
  | "error";

export interface ConnectionState {
  phase: ConnectionPhase;
  hostId?: string;
  /** Populated when phase === "error". */
  error?: string;
  /** Round-trip latency of the mosh link in ms, when known. */
  latencyMs?: number;
  since: number;
}

/** Result of a sentinel-framed structured command. */
export interface CommandResult {
  action: SurgeAction;
  exitCode: number;
  stdout: string;
  /** Wall-clock duration in ms. */
  durationMs: number;
}

/* ----------------------------- Parsed models ----------------------------- */

export interface SurgeStatus {
  running: boolean;
  version?: string;
  mode?: string; // e.g. "rule", "global", "direct"
  uptimeSeconds?: number;
  outboundMode?: string;
  /** Currently active outbound policy, if surge reports one. */
  activePolicy?: string;
  raw?: unknown;
}

export interface Policy {
  name: string;
  type: string; // "select" | "url-test" | "fallback" | "direct" | "proxy" | ...
  /** For a group: the selected member. */
  selected?: string;
  /** Last measured latency in ms (for url-test members). */
  latencyMs?: number;
}

export interface PolicyGroup {
  name: string;
  type: string;
  selected?: string;
  members: string[];
}

export interface Rule {
  type: string; // DOMAIN-SUFFIX, GEOIP, FINAL, ...
  value: string;
  policy: string;
  /** Number of times the rule matched, when surge exposes counters. */
  hits?: number;
}

export interface Traffic {
  /** Bytes per second, smoothed, if available. */
  uploadBps?: number;
  downloadBps?: number;
  /** Cumulative bytes since start. */
  uploadTotal?: number;
  downloadTotal?: number;
  /** Active connection count. */
  connections?: number;
  raw?: unknown;
}

export interface LogLine {
  ts: number;
  level: "debug" | "info" | "notify" | "warning" | "error" | "unknown";
  message: string;
}
