import type {
  ActiveConnection,
  Environment,
  ExternalResource,
  LogLine,
  PolicyDump,
  PolicyTest,
  Rule,
  Traffic,
} from "./types.js";

/**
 * Parsers turn raw `surge` stdout into domain models. They are intentionally
 * defensive: surge forks and versions differ, JSON may be absent, so each parser
 * degrades gracefully and keeps the raw payload for debugging.
 */

function tryJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  // Surge may print a banner line before JSON; grab the first {...} or [...].
  const start = trimmed.search(/[[{]/);
  if (start === -1) return undefined;
  try {
    return JSON.parse(trimmed.slice(start));
  } catch {
    return undefined;
  }
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
}

/**
 * Surge sometimes wraps payloads in a response envelope
 * (`{ "result": ..., "error": ..., "<payload>": ... }`). Given a payload key,
 * return the inner payload when present, else the object itself.
 */
function unwrap(obj: Record<string, unknown>, key: string): unknown {
  if (key in obj) return obj[key];
  return obj;
}

/**
 * Parse `ls -1` output of the config directory into profile names: keep only
 * `*.conf` files and strip the extension (the name `switch-profile` expects).
 */
export function parseProfiles(stdout: string): string[] {
  return stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.endsWith(".conf"))
    .map((l) => l.replace(/\.conf$/, ""))
    .sort((a, b) => a.localeCompare(b));
}

/** Surface a Surge `error` field from a --raw response, if any. */
export function extractError(stdout: string): string | undefined {
  const rec = asRecord(tryJson(stdout));
  return rec ? str(rec.error) : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/** Flatten `surge --raw environment` JSON into displayable key/value pairs. */
export function parseEnvironment(stdout: string): Environment {
  const json = tryJson(stdout);
  const fields: Record<string, string> = {};
  const selection: Record<string, string> = {};
  let proxyMode: number | undefined;

  const outer = asRecord(json);
  const env = asRecord(outer ? unwrap(outer, "environment") : undefined);
  if (env) {
    for (const [k, v] of Object.entries(env)) {
      if (v === null || v === undefined) continue;
      if (k === "ProxyGroupSelection") {
        const sel = asRecord(v);
        if (sel) {
          for (const [g, p] of Object.entries(sel)) {
            const name = str(p);
            if (name) selection[g] = name;
          }
        }
        continue;
      }
      if (k === "ProxyMode") {
        proxyMode = num(v) ?? Number(v);
        if (!Number.isFinite(proxyMode)) proxyMode = undefined;
      }
      fields[k] = typeof v === "object" ? JSON.stringify(v) : String(v);
    }
  }
  return { fields, selection, proxyMode, raw: json ?? stdout };
}

function nameOf(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  const rec = asRecord(v);
  return rec ? str(rec.name) ?? str(rec.key) ?? str(rec.url) ?? str(rec.path) : undefined;
}

function toNames(v: unknown): string[] {
  return Array.isArray(v)
    ? v.map(nameOf).filter((m): m is string => !!m)
    : [];
}

/**
 * `surge --raw dump policy` →
 *   {"proxies":["UK","US",...],"policy-groups":["Relay","Apple",...]}
 */
export function parsePolicies(stdout: string): PolicyDump {
  const rec = asRecord(tryJson(stdout));
  return {
    proxies: toNames(rec?.proxies),
    groups: toNames(rec?.["policy-groups"] ?? rec?.policyGroups ?? rec?.groups),
  };
}

/**
 * `surge --raw dump policy-group-sub-policies` → group → member names.
 * Tolerant of `{ "Group": [...] }` and `{ "Group": { "all": [...] } }`.
 */
export function parseSubPolicies(stdout: string): Record<string, string[]> {
  const outer = asRecord(tryJson(stdout));
  if (!outer) return {};
  const rec =
    asRecord(outer.map) ??
    asRecord(unwrap(outer, "policy-group-sub-policies")) ??
    outer;
  const out: Record<string, string[]> = {};
  for (const [group, value] of Object.entries(rec)) {
    if (Array.isArray(value)) out[group] = toNames(value);
    else {
      const g = asRecord(value);
      if (g) out[group] = toNames(g.all ?? g.members ?? g.subPolicies);
    }
  }
  return out;
}

/**
 * `surge --raw test-all-policies` / `test-policy` / `test-group` →
 *   {"UK":{"tcp":66,"receive":415,"available":69,"round-one-total":1055},
 *    "CA":{"error":"Socket closed by remote peer","available":0}, ...}
 */
export function parsePolicyTests(stdout: string): PolicyTest[] {
  const rec = asRecord(tryJson(stdout));
  if (!rec) return [];
  const out: PolicyTest[] = [];
  for (const [name, value] of Object.entries(rec)) {
    const r = asRecord(value);
    if (!r) continue;
    out.push({
      name,
      tcpMs: num(r.tcp),
      receiveMs: num(r.receive),
      available: num(r.available),
      roundOneTotal: num(r["round-one-total"]),
      error: str(r.error),
    });
  }
  return out;
}


/**
 * Parse one classic comma-separated rule line into a Rule.
 *   "DOMAIN-SUFFIX,google.com,Proxy"  → matcher rule (type,value,policy)
 *   "FINAL,Proxy"  /  "FINAL,Proxy,dns-failed"  → FINAL rule (no value)
 * Trailing options (e.g. `no-resolve`, `dns-failed`) after the policy are kept
 * out of the model.
 */
function parseRuleLine(line: string): Rule | undefined {
  const parts = line.split(",").map((p) => p.trim());
  const type = parts[0];
  if (!type) return undefined;
  // FINAL has no matcher value: the second token is the policy itself.
  if (type === "FINAL") {
    return parts[1] ? { type, value: "", policy: parts[1] } : undefined;
  }
  if (parts.length < 3) return undefined;
  return { type, value: parts[1]!, policy: parts[2]! };
}

/**
 * `surge --raw dump rule` → `{"rules":["DOMAIN-SUFFIX,google.com,Proxy", ...]}`
 * (each entry is a classic rule string). Tolerant of a bare array, an array of
 * `{type,value,policy}` objects, or plain newline-delimited text.
 */
export function parseRules(stdout: string): Rule[] {
  const json = tryJson(stdout);
  const arr = ruleArray(json);
  if (arr) {
    return arr
      .map((item): Rule | undefined => {
        if (typeof item === "string") return parseRuleLine(item);
        const r = asRecord(item);
        if (!r) return undefined;
        const type = str(r.type) ?? "";
        if (!type) return undefined;
        return {
          type,
          value: str(r.value) ?? str(r.pattern) ?? "",
          policy: str(r.policy) ?? str(r.target) ?? "",
          hits: num(r.hits) ?? num(r.count),
        };
      })
      .filter((r): r is Rule => !!r);
  }
  // Fallback: classic comma-separated rule lines, one per line.
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map(parseRuleLine)
    .filter((r): r is Rule => !!r);
}

/** Extract the rule array from a bare array or a `{ "rules": [...] }` envelope. */
function ruleArray(json: unknown): unknown[] | undefined {
  if (Array.isArray(json)) return json;
  const rec = asRecord(json);
  if (rec && Array.isArray(rec.rules)) return rec.rules as unknown[];
  return undefined;
}

/**
 * Parse `surge --raw dump temp-rule` into raw rule strings. Each string is the
 * exact rule line that `del-temp-rule <rule>` expects back. Tolerant of an
 * array of strings, an array of {type,value,policy} objects, or plain text.
 */
export function parseTempRules(stdout: string): string[] {
  const json = tryJson(stdout);
  const arr = Array.isArray(json)
    ? json
    : Array.isArray(asRecord(json)?.["temp-rule"])
      ? (asRecord(json)!["temp-rule"] as unknown[])
      : Array.isArray(asRecord(json)?.rules)
        ? (asRecord(json)!.rules as unknown[])
      : undefined;
  if (arr) {
    return arr
      .map((item) => {
        if (typeof item === "string") return item;
        const r = asRecord(item);
        if (!r) return "";
        const parts = [str(r.type), str(r.value) ?? str(r.pattern), str(r.policy)]
          .filter((p): p is string => !!p);
        return parts.join(",");
      })
      .filter((s) => s);
  }
  return stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

/** Parse `surge --raw external-resource list`. */
export function parseExternalResources(stdout: string): ExternalResource[] {
  const json = tryJson(stdout);
  const list = Array.isArray(json)
    ? json
    : Array.isArray(asRecord(json)?.resources)
      ? (asRecord(json)!.resources as unknown[])
      : Array.isArray(asRecord(json)?.defines)
        ? (asRecord(json)!.defines as unknown[])
      : [];
  return list
    .map(asRecord)
    .filter((r): r is Record<string, unknown> => !!r)
    .map((r) => ({
      key: str(r.key) ?? str(r.hash) ?? str(r.url) ?? "",
      url: str(r.url) ?? str(r.path),
      ready: typeof r.ready === "boolean" ? r.ready : undefined,
      updatedAt: num(r.updatedAt) ?? num(r.updated),
    }))
    .filter((r) => r.key);
}

/**
 * Parse `surge --raw dump active` into a connection list. Surge returns the
 * active requests under a `requests` envelope (`{"requests":[...]}`); older/forked
 * shapes use `connections` or a bare array — all are accepted.
 */
export function parseActive(stdout: string): ActiveConnection[] {
  const json = tryJson(stdout);
  const rec = asRecord(json);
  const list = Array.isArray(json)
    ? json
    : Array.isArray(rec?.requests)
      ? (rec!.requests as unknown[])
      : Array.isArray(rec?.["active-requests"])
        ? (rec!["active-requests"] as unknown[])
      : Array.isArray(rec?.connections)
        ? (rec!.connections as unknown[])
        : [];
  return list
    .map(asRecord)
    .filter((c): c is Record<string, unknown> => !!c)
    .map((c, i) => ({
      // Surge request ids are numbers; keep them as strings for `kill <id>`.
      id: idStr(c.id) ?? idStr(c.connectionId) ?? String(i),
      remote:
        str(c.remoteHost) ??
        str(c.URL) ??
        str(c.remoteAddress) ??
        str(c.remote) ??
        str(c.host) ??
        str(c.URL) ??
        str(c.url) ??
        "—",
      policy:
        str(c.policyName) ??
        str(c.originalPolicyName) ??
        str(c.policy) ??
        str(c.proxy),
      rule: str(c.rule) ?? str(c.ruleName),
      uploadBytes: num(c.outBytes) ?? num(c.uploadBytes) ?? num(c.upload),
      downloadBytes: num(c.inBytes) ?? num(c.downloadBytes) ?? num(c.download),
      raw: c,
    }));
}

/** Coerce a string-or-number id into a string (Surge uses numeric ids). */
function idStr(v: unknown): string | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return str(v);
}

/** Aggregate `dump active` connections into totals for the dashboard. */
export function aggregateTraffic(connections: ActiveConnection[]): Traffic {
  let uploadTotal = 0;
  let downloadTotal = 0;
  for (const c of connections) {
    uploadTotal += c.uploadBytes ?? 0;
    downloadTotal += c.downloadBytes ?? 0;
  }
  return {
    connections: connections.length,
    uploadTotal: uploadTotal || undefined,
    downloadTotal: downloadTotal || undefined,
  };
}

const LOG_LEVELS = ["debug", "info", "notify", "warning", "error"] as const;

export function parseLogLine(line: string): LogLine {
  const lower = line.toLowerCase();
  const level =
    LOG_LEVELS.find((l) => lower.includes(`[${l}]`) || lower.includes(` ${l} `)) ??
    "unknown";
  // Try to extract a leading ISO/epoch timestamp; otherwise stamp now.
  const tsMatch = line.match(/^\[?(\d{4}-\d{2}-\d{2}[ T][\d:.]+)/);
  const ts = tsMatch ? Date.parse(tsMatch[1]!) || Date.now() : Date.now();
  return { ts, level, message: line };
}

/** Human-readable bytes/sec. */
export function formatBps(bps?: number): string {
  if (!bps || bps <= 0) return "0 B/s";
  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  let v = bps;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}
