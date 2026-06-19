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
  /**
   * Absolute path to Surge's config/profile directory on the remote host
   * (where `*.conf` profiles live). Enables listing/switching profiles.
   */
  configDir?: string;
  createdAt: number;
  lastConnectedAt?: number;
}

/** Per-host customisation of the surge command catalog. */
export interface SurgeProfile {
  /** Absolute path to the Surge CLI binary. */
  bin: string;
  /**
   * Optional argv overrides keyed by {@link SurgeAction}. When present, replaces
   * the default argv template for that action (the leading `bin` is implied).
   */
  argv?: Partial<Record<SurgeAction, string[]>>;
}

export const DEFAULT_SURGE_BIN =
  "/Applications/Surge.app/Contents/Applications/surge-cli";

/**
 * Actions map 1:1 onto real Surge CLI commands (see the CLI reference). Query
 * actions are run with the global `--raw` flag for JSON output; `watchRequest`
 * is the only streaming command.
 */
export type SurgeAction =
  // lifecycle / profile
  | "reload" // reload the main profile
  | "stop" // shut down Surge
  | "switchProfile" // switch-profile <name>
  // inspection (dump *)
  | "environment" // environment
  | "dumpPolicy" // dump policy
  | "dumpPolicySubPolicies" // dump policy-group-sub-policies
  | "dumpRule" // dump rule
  | "dumpActive" // dump active
  | "dumpRequest" // dump request
  | "dumpDns" // dump dns
  | "dumpTempRule" // dump temp-rule
  | "dumpProfileEffective" // dump profile effective
  | "dumpProfileOriginal" // dump profile original
  // streaming
  | "watchRequest" // watch request
  // testing
  | "testNetwork" // test-network
  | "testPolicy" // test-policy <name>
  | "testAllPolicies" // test-all-policies
  | "testGroup" // test-group <name>
  | "testPolicyBandwidth" // test-policy-bandwidth <download|upload> <policy>
  // temporary rules
  | "addTempRule" // add-temp-rule <rule>
  | "delTempRule" // del-temp-rule <rule>
  | "updateTempRule" // update-temp-rule <rule> <new-policy>
  | "flushTempRule" // flush-temp-rule
  // external resources
  | "externalResourceList" // external-resource list
  | "externalResourceUpdate" // external-resource update <key>
  | "externalResourceUpdateAll" // external-resource update all
  // operations
  | "flushDns" // flush dns
  | "diagnostics" // diagnostics
  | "kill" // kill <connection-id>
  | "setLogLevel" // set-log-level <level>
  | "setEnvironment"; // set <key-path> <value>

export type ConnectionPhase =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export interface ConnectionState {
  phase: ConnectionPhase;
  hostId?: string;
  /** Populated when phase === "error". */
  error?: string;
  /** Round-trip latency of the SSH link in ms, when known. */
  latencyMs?: number;
  since: number;
}

/** Result of a structured surge command run over SSH exec. */
export interface CommandResult {
  action: SurgeAction;
  exitCode: number;
  stdout: string;
  /** Wall-clock duration in ms. */
  durationMs: number;
}

/* ----------------------------- Parsed models ----------------------------- */

/** Parsed from `surge --raw environment`. Shape varies, so keep it generic. */
export interface Environment {
  /** Flattened key/value view for display. */
  fields: Record<string, string>;
  /** ProxyGroupSelection: select-group name → currently selected policy. */
  selection: Record<string, string>;
  /** ProxyMode: 0 = Direct, 1 = Global Proxy, 2 = Rule. */
  proxyMode?: number;
  raw?: unknown;
}

/** Parsed from `surge --raw dump policy` → just the names of each. */
export interface PolicyDump {
  proxies: string[];
  groups: string[];
}

/** Outbound mode values for the `ProxyMode` environment key. */
export const PROXY_MODES = [
  { value: 0, label: "Direct" },
  { value: 1, label: "Global" },
  { value: 2, label: "Rule" },
] as const;

/**
 * Boolean environment switches that can be toggled with
 * `set <Key>=0|1`. Current state is read from the environment dictionary.
 */
export const FEATURE_TOGGLES = [
  { key: "MitMEnabled", label: "MitM" },
  { key: "RewriteEnabled", label: "Rewrite" },
  { key: "ScriptingEnabled", label: "Scripting" },
  { key: "Replica", label: "HTTP Capture" },
] as const;

/** True when an environment field holds a truthy boolean ("1"/"true"). */
export function isToggleOn(value: string | undefined): boolean {
  return value === "1" || value === "true";
}

/**
 * One proxy's result from `surge --raw test-all-policies` /
 * `test-policy` / `test-group`. Surge reports TCP-connect and receive (TTFB)
 * latencies in ms, an availability score, and an error string on failure.
 */
export interface PolicyTest {
  name: string;
  tcpMs?: number;
  receiveMs?: number;
  available?: number;
  roundOneTotal?: number;
  error?: string;
}

export interface Rule {
  type: string; // DOMAIN-SUFFIX, GEOIP, FINAL, ...
  value: string;
  policy: string;
  /** Number of times the rule matched, when surge exposes counters. */
  hits?: number;
}

/** One entry from `surge --raw external-resource list`. */
export interface ExternalResource {
  key: string;
  url?: string;
  ready?: boolean;
  /** Epoch ms of the last update, when reported (remote resources). */
  updatedAt?: number;
}

/** One entry from `surge --raw dump active`. */
export interface ActiveConnection {
  id: string;
  /** Best-effort description (host:port or remote address). */
  remote: string;
  /** Matched policy/proxy for this connection. */
  policy?: string;
  rule?: string;
  uploadBytes?: number;
  downloadBytes?: number;
  raw?: unknown;
}

/** Aggregate derived from `dump active`. */
export interface Traffic {
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
