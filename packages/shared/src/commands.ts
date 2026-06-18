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
  version: { action: "version", argv: ["--version"], mutates: false, arity: 0 },
  status: { action: "status", argv: ["--raw", "status"], mutates: false, arity: 0 },
  start: { action: "start", argv: ["start"], mutates: true, arity: 0 },
  stop: { action: "stop", argv: ["stop"], mutates: true, arity: 0 },
  restart: { action: "restart", argv: ["restart"], mutates: true, arity: 0 },
  reload: { action: "reload", argv: ["reload"], mutates: true, arity: 0 },
  policies: { action: "policies", argv: ["--raw", "policy", "list"], mutates: false, arity: 0 },
  selectPolicy: {
    action: "selectPolicy",
    argv: ["policy", "select", "{0}", "{1}"],
    mutates: true,
    arity: 2,
  },
  rules: { action: "rules", argv: ["--raw", "rule", "list"], mutates: false, arity: 0 },
  traffic: { action: "traffic", argv: ["--raw", "traffic"], mutates: false, arity: 0 },
  logsTail: { action: "logsTail", argv: ["log", "--follow"], mutates: false, streaming: true, arity: 0 },
  configPath: { action: "configPath", argv: ["config", "path"], mutates: false, arity: 0 },
  configShow: { action: "configShow", argv: ["config", "show"], mutates: false, arity: 0 },
  test: { action: "test", argv: ["test", "{0}"], mutates: false, arity: 1 },
};

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
