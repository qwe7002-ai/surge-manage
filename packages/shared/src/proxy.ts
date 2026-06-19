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
 * Protocols whose first two positional args are `server` and `port` (per the
 * Surge manual). Anything not listed keeps every positional arg in
 * {@link ProxyConfig.extraPositional}: `direct` takes none, and `wireguard`
 * references a `[WireGuard]` section via `section-name=` rather than a server.
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
  "ssh",
]);

/** True when `type` takes a `server, port` positional pair. */
export function protocolUsesServer(type: string): boolean {
  return SERVER_PROTOCOLS.has(type.toLowerCase());
}

/**
 * The widget a known parameter should be edited with. `policy` and `interface`
 * are selects populated at render time — with the available proxies/policy
 * groups and the host's network interfaces respectively.
 */
export type ProxyFieldKind =
  | "text"
  | "password"
  | "toggle"
  | "select"
  | "policy"
  | "interface";

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
  /**
   * Surge's implicit value when the parameter is absent. An explicit value
   * equal to this is treated the same as absence, so e.g. `block-quic=auto`
   * and a missing `block-quic` both render as "Auto".
   */
  defaultValue?: string;
}

/**
 * Registry of every parameter we surface as a dedicated control, keyed by its
 * Surge parameter name. Which of these apply to a given protocol is decided by
 * {@link COMMON_FIELD_KEYS} + {@link PROTOCOL_FIELD_KEYS}. Any parameter absent
 * from this registry is still editable via the generic "Additional Parameters"
 * rows and is preserved on save.
 */
const FIELD_SPECS: Record<string, ProxyFieldSpec> = {
  // --- credentials / transport (protocol-specific) ---
  username: { key: "username", label: "Username", kind: "text", placeholder: "Optional" },
  password: { key: "password", label: "Password", kind: "password", placeholder: "Optional" },
  "encrypt-method": {
    key: "encrypt-method",
    label: "Encryption Method",
    kind: "text",
    placeholder: "e.g. 2022-blake3-aes-128-gcm",
  },
  psk: { key: "psk", label: "Pre-Shared Key", kind: "password", placeholder: "Snell PSK" },
  version: { key: "version", label: "Version", kind: "text", placeholder: "e.g. 4" },
  "section-name": {
    key: "section-name",
    label: "WireGuard Section",
    kind: "text",
    hint: "Name of the [WireGuard SectionName] block that defines this peer.",
    placeholder: "e.g. Home",
  },
  obfs: {
    key: "obfs",
    label: "Obfuscating",
    kind: "select",
    options: [
      { value: "", label: "Off" },
      { value: "http", label: "HTTP" },
      { value: "tls", label: "TLS" },
    ],
  },
  "obfs-host": { key: "obfs-host", label: "Obfuscating Host", kind: "text", placeholder: "Optional" },
  "obfs-uri": { key: "obfs-uri", label: "Obfuscating URI", kind: "text", placeholder: "Optional" },
  // --- TLS / WebSocket ---
  tls: { key: "tls", label: "TLS", kind: "toggle" },
  sni: { key: "sni", label: "SNI", kind: "text", hint: "Use sni=off to disable SNI.", placeholder: "Optional" },
  "skip-cert-verify": { key: "skip-cert-verify", label: "Skip Certificate Verify", kind: "toggle" },
  alpn: { key: "alpn", label: "ALPN", kind: "text", placeholder: "e.g. h3" },
  ws: { key: "ws", label: "WebSocket", kind: "toggle" },
  "ws-path": { key: "ws-path", label: "WebSocket Path", kind: "text", placeholder: "/" },
  "ws-headers": { key: "ws-headers", label: "WebSocket Headers", kind: "text", placeholder: "Host:example.com" },
  "vmess-aead": { key: "vmess-aead", label: "VMess AEAD", kind: "toggle" },
  // --- common (every protocol) ---
  "underlying-proxy": {
    key: "underlying-proxy",
    label: "Underlying Proxy",
    kind: "policy",
    hint: "Connection to a remote host will be performed sequentially from one proxy server to another. Any proxy or policy group may be chosen.",
    placeholder: "Not Use",
  },
  "test-url": {
    key: "test-url",
    label: "Override Testing URL",
    kind: "text",
    hint: "Override the global testing URL for network diagnostics and activity cards.",
    placeholder: "http://cloudflare.com",
  },
  "test-timeout": {
    key: "test-timeout",
    label: "Testing Timeout",
    kind: "text",
    hint: "Override the global proxy testing timeout, in seconds.",
    placeholder: "5",
  },
  "block-quic": {
    key: "block-quic",
    label: "Block QUIC",
    kind: "select",
    hint: "Forwarding QUIC traffic through a proxy may cause performance issues. Blocking it falls clients back to traditional HTTPS/TCP.",
    // Surge defaults to Auto when block-quic is undefined, so Auto == absence.
    defaultValue: "auto",
    options: [
      { value: "", label: "Auto" },
      { value: "on", label: "On" },
      { value: "off", label: "Off" },
    ],
  },
  "udp-relay": {
    key: "udp-relay",
    label: "Allow UDP Relay",
    kind: "toggle",
    hint: "Forward UDP packets to the proxy server. The server may not support it, so it is off by default.",
  },
  tfo: { key: "tfo", label: "TCP Fast Open", kind: "toggle" },
  hybrid: {
    key: "hybrid",
    label: "Hybrid Network",
    kind: "toggle",
    hint: "Set up the connection over cellular and Wi-Fi simultaneously and use the faster link.",
  },
  interface: {
    key: "interface",
    label: "Bind Network Interface",
    kind: "interface",
    hint: "Force requests through a specific network interface — a secondary NIC or a VPN service.",
    placeholder: "Default",
  },
  "allow-other-interface": {
    key: "allow-other-interface",
    label: "Allow Other Interface",
    kind: "toggle",
    hint: "Fall back to the default interface when the bound one is unavailable instead of failing.",
  },
  tos: { key: "tos", label: "IP Packet TOS", kind: "text", placeholder: "Default" },
  "ip-version": {
    key: "ip-version",
    label: "IP Version",
    kind: "select",
    hint: "Only meaningful when the server hostname is a domain.",
    options: [
      { value: "", label: "Default" },
      { value: "dual", label: "Dual Stack" },
      { value: "v4-only", label: "IPv4 Only" },
      { value: "v6-only", label: "IPv6 Only" },
      { value: "prefer-v4", label: "Prefer IPv4" },
      { value: "prefer-v6", label: "Prefer IPv6" },
    ],
  },
  "no-error-alert": { key: "no-error-alert", label: "No Error Alert", kind: "toggle" },
};

/** Common parameters available on every server-based protocol, in display order. */
const COMMON_FIELD_KEYS = [
  "underlying-proxy",
  "test-url",
  "test-timeout",
  "block-quic",
  "udp-relay",
  "tfo",
  "hybrid",
  "interface",
  "allow-other-interface",
  "tos",
  "ip-version",
  "no-error-alert",
];

/**
 * Protocol-specific parameters shown before the common ones, per the Surge
 * manual's Proxy Policy reference. Protocols not listed fall back to just the
 * common parameters.
 */
const PROTOCOL_FIELD_KEYS: Record<string, string[]> = {
  http: ["username", "password"],
  https: ["username", "password", "sni", "skip-cert-verify"],
  socks5: ["username", "password"],
  "socks5-tls": ["username", "password", "sni", "skip-cert-verify"],
  ss: ["encrypt-method", "password", "obfs", "obfs-host", "obfs-uri"],
  snell: ["psk", "version", "obfs", "obfs-host"],
  vmess: [
    "username",
    "encrypt-method",
    "tls",
    "sni",
    "skip-cert-verify",
    "ws",
    "ws-path",
    "ws-headers",
    "vmess-aead",
  ],
  trojan: ["password", "sni", "skip-cert-verify", "ws", "ws-path", "ws-headers"],
  tuic: ["password", "alpn", "sni", "skip-cert-verify"],
  "tuic-v5": ["password", "alpn", "sni", "skip-cert-verify"],
  hysteria2: ["password", "sni", "skip-cert-verify"],
  wireguard: ["section-name"],
  ssh: ["username", "password"],
};

/**
 * `direct` does not connect to a proxy server: it just forwards traffic out a
 * chosen network interface. Its editor therefore exposes only the bind
 * interface and nothing else (no server/port, encryption, obfuscation, …).
 */
const DIRECT_FIELD_KEYS = ["interface"];

/** Every parameter that has a dedicated control, across all protocols. */
export const PROXY_FIELDS: ProxyFieldSpec[] = Object.values(FIELD_SPECS);

/** True when `key` has a dedicated control for some protocol. */
export function isKnownProxyField(key: string): boolean {
  return key.toLowerCase() in FIELD_SPECS;
}

/**
 * The curated fields that apply to a given protocol: protocol-specific
 * parameters first, then the common ones. `direct` is restricted to the bind
 * interface, and unknown protocols get only the common set.
 */
export function proxyFieldsFor(type: string): ProxyFieldSpec[] {
  const t = type.toLowerCase();
  const keys =
    t === "direct"
      ? DIRECT_FIELD_KEYS
      : [...(PROTOCOL_FIELD_KEYS[t] ?? []), ...COMMON_FIELD_KEYS];
  return keys.map((k) => FIELD_SPECS[k]).filter((f): f is ProxyFieldSpec => !!f);
}

/**
 * True when a protocol only supports the curated subset returned by
 * {@link proxyFieldsFor} (so free-form "additional parameters" make no sense).
 */
export function isRestrictedProtocol(type: string): boolean {
  return type.toLowerCase() === "direct";
}

/**
 * Curated fields organised into labelled sections, in display order. The editor
 * renders one titled group per section, which is far more readable than one
 * flat list. Each group lists the parameter keys it owns (also in order).
 */
export const PROXY_FIELD_GROUPS: { id: string; title: string; keys: string[] }[] = [
  {
    id: "auth",
    title: "Authentication & Encryption",
    keys: [
      "username",
      "password",
      "encrypt-method",
      "psk",
      "version",
      "section-name",
      "tls",
      "sni",
      "skip-cert-verify",
      "alpn",
    ],
  },
  { id: "obfs", title: "Obfuscation", keys: ["obfs", "obfs-host", "obfs-uri"] },
  {
    id: "transport",
    title: "WebSocket Transport",
    keys: ["ws", "ws-path", "ws-headers", "vmess-aead"],
  },
  { id: "chain", title: "Proxy Chain", keys: ["underlying-proxy"] },
  { id: "testing", title: "Testing", keys: ["test-url", "test-timeout"] },
  {
    id: "egress",
    title: "Egress Control",
    keys: ["interface", "allow-other-interface", "tos", "ip-version"],
  },
  {
    id: "options",
    title: "Options",
    keys: ["block-quic", "udp-relay", "tfo", "hybrid", "no-error-alert"],
  },
];

/** A section of the proxy editor: a title plus the fields it contains. */
export interface ProxyFieldGroup {
  id: string;
  title: string;
  fields: ProxyFieldSpec[];
}

/**
 * {@link proxyFieldsFor} arranged into {@link PROXY_FIELD_GROUPS}. Only groups
 * with at least one applicable field for `type` are returned, preserving both
 * group order and within-group field order.
 */
export function groupedProxyFields(type: string): ProxyFieldGroup[] {
  const applicable = new Set(proxyFieldsFor(type).map((f) => f.key));
  const groups: ProxyFieldGroup[] = [];
  for (const group of PROXY_FIELD_GROUPS) {
    const fields = group.keys
      .filter((k) => applicable.has(k))
      .map((k) => FIELD_SPECS[k])
      .filter((f): f is ProxyFieldSpec => !!f);
    if (fields.length > 0) {
      groups.push({ id: group.id, title: group.title, fields });
    }
  }
  return groups;
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
