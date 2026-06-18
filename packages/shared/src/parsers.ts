import type {
  LogLine,
  Policy,
  PolicyGroup,
  Rule,
  SurgeStatus,
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

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

export function parseStatus(stdout: string): SurgeStatus {
  const json = asRecord(tryJson(stdout));
  if (json) {
    return {
      running: json.running === true || json.status === "running",
      version: str(json.version),
      mode: str(json.mode) ?? str(json.outboundMode),
      uptimeSeconds: num(json.uptime) ?? num(json.uptimeSeconds),
      outboundMode: str(json.outboundMode) ?? str(json.mode),
      activePolicy: str(json.activePolicy) ?? str(json.policy),
      raw: json,
    };
  }
  // Fallback: plain text. "running" presence is a good-enough heuristic.
  const text = stdout.toLowerCase();
  return {
    running: /running|active|started/.test(text) && !/not running|stopped/.test(text),
    raw: stdout,
  };
}

export function parsePolicies(stdout: string): PolicyGroup[] {
  const json = tryJson(stdout);
  if (Array.isArray(json)) {
    return json
      .map(asRecord)
      .filter((g): g is Record<string, unknown> => !!g)
      .map((g) => ({
        name: str(g.name) ?? "",
        type: str(g.type) ?? "select",
        selected: str(g.selected) ?? str(g.now),
        members: Array.isArray(g.members)
          ? g.members.map((m) => str(m) ?? String(m))
          : Array.isArray(g.all)
            ? g.all.map((m) => str(m) ?? String(m))
            : [],
      }))
      .filter((g) => g.name);
  }
  return [];
}

export function parsePolicyLatencies(stdout: string): Policy[] {
  const json = tryJson(stdout);
  if (!Array.isArray(json)) return [];
  return json
    .map(asRecord)
    .filter((p): p is Record<string, unknown> => !!p)
    .map((p) => ({
      name: str(p.name) ?? "",
      type: str(p.type) ?? "proxy",
      selected: str(p.selected),
      latencyMs: num(p.latency) ?? num(p.delay) ?? num(p.latencyMs),
    }))
    .filter((p) => p.name);
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

export function parseTraffic(stdout: string): Traffic {
  const json = asRecord(tryJson(stdout));
  if (json) {
    return {
      uploadBps: num(json.uploadBps) ?? num(json.up),
      downloadBps: num(json.downloadBps) ?? num(json.down),
      uploadTotal: num(json.uploadTotal) ?? num(json.upTotal),
      downloadTotal: num(json.downloadTotal) ?? num(json.downTotal),
      connections: num(json.connections) ?? num(json.conns),
      raw: json,
    };
  }
  return { raw: stdout };
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
