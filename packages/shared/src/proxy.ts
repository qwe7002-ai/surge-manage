/**
 * Structured model of a single Surge `[Proxy]` line, used by the proxy editor
 * to render the raw `Name = type, server, port, key=value, …` syntax as labelled
 * form controls (à la Surge's own "Edit Proxy" dialog) without losing anything.
 *
 * The model is intentionally lossless: positional arguments beyond
 * server/port and any parameter we don't surface as a dedicated control are
 * preserved verbatim and round-trip back into the line on save.
 */

/** One `key=value` parameter trailing a proxy line, kept in source order. */
export interface ProxyParam {
  key: string;
  value: string;
}

/** A parsed `[Proxy]` entry. */
export interface ProxyConfig {
  /** Policy name (left of the `=`). */
  name: string;
  /** Protocol keyword, e.g. `ss`, `http`, `trojan`, `direct`. */
  type: string;
  /** Hostname/IP for server-based protocols (positional arg 1). */
  server?: string;
  /** Port for server-based protocols (positional arg 2). */
  port?: string;
  /**
   * Positional arguments beyond server/port (rare — preserved as-is so unusual
   * protocols survive an edit).
   */
  extraPositional: string[];
  /** Trailing `key=value` parameters, in source order. */
  params: ProxyParam[];
}

/** Friendly label for each known protocol keyword. */
export const PROXY_PROTOCOLS = [
  { value: "direct", label: "Direct" },
  { value: "http", label: "HTTP" },
  { value: "https", label: "HTTPS" },
  { value: "socks5", label: "SOCKS5" },
  { value: "socks5-tls", label: "SOCKS5 over TLS" },
  { value: "ss", label: "Shadowsocks" },
  { value: "snell", label: "Snell" },
  { value: "trojan", label: "Trojan" },
  { value: "vmess", label: "VMess" },
  { value: "tuic", label: "TUIC" },
  { value: "tuic-v5", label: "TUIC v5" },
  { value: "hysteria2", label: "Hysteria 2" },
  { value: "wireguard", label: "WireGuard" },
  { value: "ssh", label: "SSH" },
  { value: "external", label: "External" },
] as const;

/**
 * Protocols whose first two positional args are `server` and `port`. Anything
 * not listed (e.g. `direct`, `reject`) keeps every positional arg in
 * {@link ProxyConfig.extraPositional}.
 */
const SERVER_PROTOCOLS = new Set([
  "http",
  "https",
  "socks5",
  "socks5-tls",
  "ss",
  "snell",
  "trojan",
  "vmess",
  "tuic",
  "tuic-v5",
  "hysteria2",
  "wireguard",
  "ssh",
]);

/** True when `type` takes a `server, port` positional pair. */
export function protocolUsesServer(type: string): boolean {
  return SERVER_PROTOCOLS.has(type.toLowerCase());
}

/** The widget a known parameter should be edited with. */
export type ProxyFieldKind = "text" | "password" | "toggle" | "select";

/** UI metadata for a known proxy parameter. */
export interface ProxyFieldSpec {
  /** Surge parameter key (left of `=`). */
  key: string;
  label: string;
  kind: ProxyFieldKind;
  /** Help text shown under the control. */
  hint?: string;
  /** Options for `kind === "select"`. The first is the implicit default. */
  options?: { value: string; label: string }[];
  /** Placeholder for text inputs. */
  placeholder?: string;
}

/**
 * Curated parameters surfaced as dedicated controls, mirroring Surge's
 * "Edit Proxy" dialog. Any parameter not listed here is still editable via the
 * generic "Additional parameters" rows and is preserved on save.
 */
export const PROXY_FIELDS: ProxyFieldSpec[] = [
  {
    key: "username",
    label: "Username",
    kind: "text",
    placeholder: "Optional",
  },
  {
    key: "encrypt-method",
    label: "Encryption Method",
    kind: "text",
    placeholder: "e.g. 2022-blake3-aes-128-gcm",
  },
  {
    key: "password",
    label: "Password",
    kind: "password",
    placeholder: "Optional",
  },
  {
    key: "obfs",
    label: "Obfuscating",
    kind: "select",
    options: [
      { value: "", label: "Off" },
      { value: "http", label: "HTTP" },
      { value: "tls", label: "TLS" },
    ],
  },
  {
    key: "obfs-host",
    label: "Obfuscating Host",
    kind: "text",
    placeholder: "Optional",
  },
  {
    key: "sni",
    label: "SNI",
    kind: "text",
    placeholder: "Optional",
  },
  {
    key: "block-quic",
    label: "Block QUIC",
    kind: "select",
    hint: "Forwarding QUIC traffic through a proxy may cause performance issues. Blocking it falls clients back to traditional HTTPS/TCP.",
    options: [
      { value: "auto", label: "Auto" },
      { value: "on", label: "On" },
      { value: "off", label: "Off" },
    ],
  },
  {
    key: "underlying-proxy",
    label: "Underlying Proxy",
    kind: "text",
    hint: "Connection to a remote host will be performed sequentially from one proxy server to another.",
    placeholder: "Not Use",
  },
  {
    key: "test-url",
    label: "Override Testing URL",
    kind: "text",
    hint: "Override the global testing URL for network diagnostics and activity cards.",
    placeholder: "http://cloudflare.com",
  },
  {
    key: "interface",
    label: "Bind Network Interface",
    kind: "text",
    hint: "Force requests to go through the specific network interface. A secondary NIC or a VPN service.",
    placeholder: "Optional",
  },
  {
    key: "tos",
    label: "IP Packet TOS",
    kind: "text",
    placeholder: "Default",
  },
  {
    key: "ip-version",
    label: "IP Version",
    kind: "select",
    options: [
      { value: "", label: "Default" },
      { value: "dual", label: "Dual Stack" },
      { value: "v4-only", label: "IPv4 Only" },
      { value: "v6-only", label: "IPv6 Only" },
      { value: "prefer-v4", label: "Prefer IPv4" },
      { value: "prefer-v6", label: "Prefer IPv6" },
    ],
  },
  {
    key: "udp-relay",
    label: "Allow UDP Relay",
    kind: "toggle",
    hint: "Forward UDP packets to the proxy server if enhanced mode is enabled.",
  },
  {
    key: "tfo",
    label: "TCP Fast Open",
    kind: "toggle",
  },
  {
    key: "skip-cert-verify",
    label: "Skip Certificate Verify",
    kind: "toggle",
  },
];

const FIELD_KEYS = new Set(PROXY_FIELDS.map((f) => f.key));

/** True when `key` has a dedicated control (so it shouldn't appear in the generic rows). */
export function isKnownProxyField(key: string): boolean {
  return FIELD_KEYS.has(key.toLowerCase());
}

/**
 * Parse one `[Proxy]` entry line into a {@link ProxyConfig}. Returns undefined
 * when the line has no `=` name separator or an empty name/type.
 *
 *   "asia = ss, asia.example.com, 30000, encrypt-method=aes-128-gcm, udp-relay=true"
 */
export function parseProxyLine(line: string): ProxyConfig | undefined {
  const eq = line.indexOf("=");
  if (eq === -1) return undefined;
  const name = line.slice(0, eq).trim();
  if (!name) return undefined;

  const tokens = line
    .slice(eq + 1)
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  const type = tokens.shift();
  if (!type) return undefined;

  const positional: string[] = [];
  const params: ProxyParam[] = [];
  for (const tok of tokens) {
    const i = tok.indexOf("=");
    if (i === -1) {
      positional.push(tok);
    } else {
      params.push({ key: tok.slice(0, i).trim(), value: tok.slice(i + 1).trim() });
    }
  }

  let server: string | undefined;
  let port: string | undefined;
  let extraPositional = positional;
  if (protocolUsesServer(type)) {
    server = positional[0];
    port = positional[1];
    extraPositional = positional.slice(2);
  }

  return { name, type, server, port, extraPositional, params };
}

/** Serialize a {@link ProxyConfig} back into a `[Proxy]` entry line. */
export function serializeProxyLine(config: ProxyConfig): string {
  const parts: string[] = [config.type.trim()];
  if (protocolUsesServer(config.type)) {
    if (config.server?.trim()) parts.push(config.server.trim());
    if (config.port?.trim()) parts.push(config.port.trim());
  }
  for (const p of config.extraPositional) {
    if (p.trim()) parts.push(p.trim());
  }
  for (const p of config.params) {
    const key = p.key.trim();
    if (!key) continue;
    parts.push(`${key}=${p.value.trim()}`);
  }
  return `${config.name.trim()} = ${parts.join(", ")}`;
}

/** Read a parameter's value by key (case-insensitive), or undefined if absent. */
export function getProxyParam(config: ProxyConfig, key: string): string | undefined {
  const lower = key.toLowerCase();
  return config.params.find((p) => p.key.toLowerCase() === lower)?.value;
}

/**
 * Return a copy of `config` with `key` set to `value`. An empty `value` removes
 * the parameter. Existing keys are updated in place (preserving order); new
 * keys are appended. Comparison is case-insensitive.
 */
export function setProxyParam(
  config: ProxyConfig,
  key: string,
  value: string,
): ProxyConfig {
  const lower = key.toLowerCase();
  const idx = config.params.findIndex((p) => p.key.toLowerCase() === lower);
  const params = [...config.params];
  if (value === "") {
    if (idx !== -1) params.splice(idx, 1);
  } else if (idx === -1) {
    params.push({ key, value });
  } else {
    params[idx] = { key: params[idx]!.key, value };
  }
  return { ...config, params };
}

/** The proxy name from a raw entry line, or undefined when malformed. */
export function proxyEntryName(entry: string): string | undefined {
  const eq = entry.indexOf("=");
  if (eq === -1) return undefined;
  const name = entry.slice(0, eq).trim();
  return name || undefined;
}
