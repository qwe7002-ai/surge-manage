/**
 * Minimal, lossless model of a Surge profile config for structured editing.
 *
 * The file is parsed into ordered sections (`[Name]` headers plus a leading
 * preamble with `name === null`). Each section keeps its raw lines verbatim, so
 * sections we don't touch — `[General]`, comments, blank lines — survive a
 * round-trip unchanged. Editors read/replace the *entries* (non-comment lines)
 * of a single section and write the document back.
 */

export interface ConfigSection {
  /** Section header name (e.g. "Proxy"), or null for the leading preamble. */
  name: string | null;
  /** Raw lines belonging to this section (header line excluded). */
  lines: string[];
}

export function parseConfigDocument(text: string): ConfigSection[] {
  const sections: ConfigSection[] = [];
  let current: ConfigSection = { name: null, lines: [] };
  sections.push(current);
  for (const raw of text.split(/\r?\n/)) {
    const m = /^\s*\[(.+)\]\s*$/.exec(raw);
    if (m) {
      current = { name: m[1]!.trim(), lines: [] };
      sections.push(current);
    } else {
      current.lines.push(raw);
    }
  }
  return sections;
}

export function serializeConfigDocument(sections: ConfigSection[]): string {
  const parts: string[] = [];
  for (const s of sections) {
    if (s.name !== null) parts.push(`[${s.name}]`);
    parts.push(...s.lines);
  }
  return parts.join("\n");
}

function isEntry(line: string): boolean {
  const t = line.trim();
  return !!t && !t.startsWith("#") && !t.startsWith("//") && !t.startsWith(";");
}

/** The trimmed, non-comment entry lines of the first section matching `name`. */
export function getSectionEntries(sections: ConfigSection[], name: string): string[] {
  const s = sections.find((x) => x.name?.toLowerCase() === name.toLowerCase());
  if (!s) return [];
  return s.lines.filter(isEntry).map((l) => l.trim());
}

/**
 * Return a copy of `sections` with the named section's content replaced by
 * `entries`. The section is created (appended) when absent. In-section comments
 * are not preserved — structured editing replaces the whole section body.
 */
export function setSectionEntries(
  sections: ConfigSection[],
  name: string,
  entries: string[],
): ConfigSection[] {
  const next = sections.map((s) => ({ name: s.name, lines: [...s.lines] }));
  const existing = next.find((x) => x.name?.toLowerCase() === name.toLowerCase());
  if (existing) {
    existing.lines = [...entries];
  } else {
    next.push({ name, lines: [...entries] });
  }
  return next;
}

/** Parse `[Proxy Group]` lines into group name → group type (`select`, `smart`, …). */
export function getPolicyGroupTypes(sections: ConfigSection[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of getSectionEntries(sections, "Proxy Group")) {
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const name = line.slice(0, eq).trim();
    const rest = line.slice(eq + 1).trim();
    const type = rest.split(",", 1)[0]?.trim().toLowerCase();
    if (name && type) out[name] = type;
  }
  return out;
}

/**
 * A single line of a Surge `[Rule]` section. A `#`-prefixed line that still
 * looks like a rule is a *disabled* rule (toggleable); one that does not is a
 * plain *comment* (shown read-only, never toggled into a rule).
 */
export interface RuleEntry {
  /** Rule / comment text with any leading comment marker stripped. */
  text: string;
  /** For rules: active vs disabled. Always false for comments. */
  enabled: boolean;
  /** True when the line is a plain comment rather than a (disabled) rule. */
  comment: boolean;
}

/** Leading comment marker on a commented line (`#`, `//` or `;`). */
const RULE_COMMENT_RE = /^(?:#+|\/\/|;)\s?/;

/**
 * A commented line "looks like a rule" when its first comma-separated token is
 * an all-caps rule type (`DOMAIN-SUFFIX`, `IP-CIDR`, `FINAL`, `AND`, …). Plain
 * prose comments (`# === Streaming ===`) do not match.
 */
const RULE_LIKE_RE = /^[A-Z][A-Z0-9-]*,/;

/**
 * Read a `[Rule]`-style section preserving order. Unlike {@link
 * getSectionEntries}, commented lines are kept: rule-like ones as disabled
 * rules, the rest as plain comments.
 */
export function getRuleEntries(sections: ConfigSection[], name: string): RuleEntry[] {
  const s = sections.find((x) => x.name?.toLowerCase() === name.toLowerCase());
  if (!s) return [];
  const out: RuleEntry[] = [];
  for (const raw of s.lines) {
    const t = raw.trim();
    if (!t) continue;
    const m = RULE_COMMENT_RE.exec(t);
    if (m) {
      const text = t.slice(m[0].length).trim();
      if (!text) continue;
      out.push({ text, enabled: false, comment: !RULE_LIKE_RE.test(text) });
    } else {
      out.push({ text: t, enabled: true, comment: false });
    }
  }
  return out;
}

/**
 * Replace a `[Rule]`-style section from {@link RuleEntry} values. Disabled
 * rules and comments are written back with a `# ` prefix so they survive the
 * round-trip; only active rules are emitted bare.
 */
export function setRuleEntries(
  sections: ConfigSection[],
  name: string,
  entries: RuleEntry[],
): ConfigSection[] {
  const lines = entries
    .map((e) => ({ text: e.text.trim(), enabled: e.enabled, comment: e.comment }))
    .filter((e) => e.text)
    .map((e) => (e.enabled && !e.comment ? e.text : `# ${e.text}`));
  return setSectionEntries(sections, name, lines);
}
