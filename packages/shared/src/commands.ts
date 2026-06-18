import type { SurgeAction, SurgeProfile } from "./types.js";

/**
 * Declarative catalog of every management action.
 *
 * `argv` is the template *after* the binary name; `{n}` placeholders are filled
 * positionally from the caller-supplied args. `mutates` flags state-changing
 * actions so the UI can guard them behind confirmation. `streaming` marks
 * long-running follow commands (logs) that must not be run through the
 * request/response runner.
 */
export interface CommandSpec {
  action: SurgeAction;
  argv: string[];
  mutates: boolean;
  streaming?: boolean;
  /** Number of positional args the template expects. */
  arity: number;
}

const PLACEHOLDER = /^\{(\d+)\}$/;

export const COMMAND_CATALOG: Record<SurgeAction, CommandSpec> = {
  // lifecycle / profile
  reload: { action: "reload", argv: ["reload"], mutates: true, arity: 0 },
  stop: { action: "stop", argv: ["stop"], mutates: true, arity: 0 },
  switchProfile: {
    action: "switchProfile",
    argv: ["switch-profile", "{0}"],
    mutates: true,
    arity: 1,
  },
  // inspection (--raw → JSON)
  environment: { action: "environment", argv: ["--raw", "environment"], mutates: false, arity: 0 },
  dumpPolicy: { action: "dumpPolicy", argv: ["--raw", "dump", "policy"], mutates: false, arity: 0 },
  dumpPolicySubPolicies: {
    action: "dumpPolicySubPolicies",
    argv: ["--raw", "dump", "policy-group-sub-policies"],
    mutates: false,
    arity: 0,
  },
  dumpRule: { action: "dumpRule", argv: ["--raw", "dump", "rule"], mutates: false, arity: 0 },
  dumpActive: { action: "dumpActive", argv: ["--raw", "dump", "active"], mutates: false, arity: 0 },
  dumpRequest: { action: "dumpRequest", argv: ["--raw", "dump", "request"], mutates: false, arity: 0 },
  dumpDns: { action: "dumpDns", argv: ["--raw", "dump", "dns"], mutates: false, arity: 0 },
  dumpTempRule: {
    action: "dumpTempRule",
    argv: ["--raw", "dump", "temp-rule"],
    mutates: false,
    arity: 0,
  },
  dumpProfileEffective: {
    action: "dumpProfileEffective",
    argv: ["dump", "profile", "effective"],
    mutates: false,
    arity: 0,
  },
  dumpProfileOriginal: {
    action: "dumpProfileOriginal",
    argv: ["dump", "profile", "original"],
    mutates: false,
    arity: 0,
  },
  // streaming
  watchRequest: {
    action: "watchRequest",
    argv: ["watch", "request"],
    mutates: false,
    streaming: true,
    arity: 0,
  },
  // testing
  testNetwork: { action: "testNetwork", argv: ["test-network"], mutates: false, arity: 0 },
  testPolicy: { action: "testPolicy", argv: ["test-policy", "{0}"], mutates: false, arity: 1 },
  testAllPolicies: {
    action: "testAllPolicies",
    argv: ["test-all-policies"],
    mutates: false,
    arity: 0,
  },
  testGroup: { action: "testGroup", argv: ["test-group", "{0}"], mutates: true, arity: 1 },
  testPolicyBandwidth: {
    action: "testPolicyBandwidth",
    argv: ["test-policy-bandwidth", "{0}", "{1}"], // <download|upload> <policy>
    mutates: false,
    streaming: true,
    arity: 2,
  },
  // temporary rules
  addTempRule: { action: "addTempRule", argv: ["add-temp-rule", "{0}"], mutates: true, arity: 1 },
  delTempRule: { action: "delTempRule", argv: ["del-temp-rule", "{0}"], mutates: true, arity: 1 },
  updateTempRule: {
    action: "updateTempRule",
    argv: ["update-temp-rule", "{0}", "{1}"],
    mutates: true,
    arity: 2,
  },
  flushTempRule: {
    action: "flushTempRule",
    argv: ["flush-temp-rule"],
    mutates: true,
    arity: 0,
  },
  // external resources
  externalResourceList: {
    action: "externalResourceList",
    argv: ["--raw", "external-resource", "list"],
    mutates: false,
    arity: 0,
  },
  externalResourceUpdate: {
    action: "externalResourceUpdate",
    argv: ["external-resource", "update", "{0}"],
    mutates: true,
    arity: 1,
  },
  externalResourceUpdateAll: {
    action: "externalResourceUpdateAll",
    argv: ["external-resource", "update", "all"],
    mutates: true,
    arity: 0,
  },
  // operations
  flushDns: { action: "flushDns", argv: ["flush", "dns"], mutates: true, arity: 0 },
  diagnostics: { action: "diagnostics", argv: ["diagnostics"], mutates: false, arity: 0 },
  kill: { action: "kill", argv: ["kill", "{0}"], mutates: true, arity: 1 },
  setLogLevel: { action: "setLogLevel", argv: ["set-log-level", "{0}"], mutates: true, arity: 1 },
  // `set` takes one or more `key=value` tokens; we pass a single pre-joined
  // "key=value" string as {0} (e.g. "ProxyGroupSelection.Proxy=HK").
  setEnvironment: { action: "setEnvironment", argv: ["set", "{0}"], mutates: true, arity: 1 },
};

/**
 * Command to list profile files in the configured Surge config directory.
 * Not a surge subcommand — a plain `ls` over the same authenticated transport.
 */
export function buildListProfilesCommand(configDir: string): string {
  return `ls -1 -- ${shellQuote(configDir)}`;
}

/** Shell-quote a single token for safe interpolation into a remote command. */
export function shellQuote(token: string): string {
  if (token.length > 0 && /^[A-Za-z0-9_./:=-]+$/.test(token)) return token;
  return `'${token.replace(/'/g, `'\\''`)}'`;
}

/**
 * Resolve a fully-quoted command line for an action against a host profile.
 * @throws if the wrong number of args is supplied (guards against injection via
 *         missing placeholders).
 */
export function buildCommandLine(
  profile: SurgeProfile,
  action: SurgeAction,
  args: string[] = [],
): string {
  const spec = COMMAND_CATALOG[action];
  if (!spec) throw new Error(`Unknown surge action: ${action}`);
  if (args.length !== spec.arity) {
    throw new Error(
      `Action "${action}" expects ${spec.arity} arg(s), got ${args.length}`,
    );
  }

  const template = profile.argv?.[action] ?? spec.argv;
  const resolved = template.map((tok) => {
    const m = PLACEHOLDER.exec(tok);
    if (!m) return shellQuote(tok);
    const idx = Number(m[1]);
    const value = args[idx];
    if (value === undefined) {
      throw new Error(`Missing positional arg {${idx}} for action "${action}"`);
    }
    return shellQuote(value);
  });

  return [shellQuote(profile.bin), ...resolved].join(" ");
}
