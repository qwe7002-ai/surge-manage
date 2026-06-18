import type {
  ActiveConnection,
  Environment,
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

function toNames(v: unknown): string[] {
  return Array.isArray(v) ? v.map((m) => str(m) ?? String(m)) : [];
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
  const rec = asRecord(unwrap(outer, "policy-group-sub-policies")) ?? outer;
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


export function parseRules(stdout: string): Rule[] {
  const json = tryJson(stdout);
  if (Array.isArray(json)) {
    return json
      .map(asRecord)
      .filter((r): r is Record<string, unknown> => !!r)
      .map((r) => ({
        type: str(r.type) ?? "",
        value: str(r.value) ?? str(r.pattern) ?? "",
        policy: str(r.policy) ?? str(r.target) ?? "",
        hits: num(r.hits) ?? num(r.count),
      }))
      .filter((r) => r.type);
  }
  // Fallback: parse classic comma-separated rule lines:
  // "DOMAIN-SUFFIX,google.com,Proxy"
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const parts = line.split(",").map((p) => p.trim());
      if (parts.length >= 3) {
        return { type: parts[0]!, value: parts[1]!, policy: parts[2]! };
      }
      if (parts.length === 2 && parts[0] === "FINAL") {
        return { type: "FINAL", value: "", policy: parts[1]! };
      }
      return undefined;
    })
    .filter((r): r is Rule => !!r);
}

/** Parse `surge --raw dump active` into a connection list. */
export function parseActive(stdout: string): ActiveConnection[] {
  const json = tryJson(stdout);
  const list = Array.isArray(json)
    ? json
    : Array.isArray(asRecord(json)?.connections)
      ? (asRecord(json)!.connections as unknown[])
      : [];
  return list
    .map(asRecord)
    .filter((c): c is Record<string, unknown> => !!c)
    .map((c, i) => ({
      id: str(c.id) ?? str(c.connectionId) ?? String(i),
      remote:
        str(c.remoteAddress) ??
        str(c.remote) ??
        str(c.host) ??
        str(c.url) ??
        "—",
      policy: str(c.policyName) ?? str(c.policy) ?? str(c.proxy),
      rule: str(c.rule),
      uploadBytes: num(c.outBytes) ?? num(c.uploadBytes) ?? num(c.upload),
      downloadBytes: num(c.inBytes) ?? num(c.downloadBytes) ?? num(c.download),
      raw: c,
    }));
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
