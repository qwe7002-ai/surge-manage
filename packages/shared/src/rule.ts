/**
 * Structured model of a single Surge `[Rule]` entry, used by the rule editor to
 * render the comma-separated `TYPE,value,policy,options…` syntax as labelled
 * form controls. Logical rules (`AND`/`OR`/`NOT`) nest parenthesised
 * sub-rules and don't fit the flat shape, so they fall back to raw editing.
 */

/** A parsed rule line broken into its parts. */
export interface RuleLine {
  /** Matcher type, e.g. `DOMAIN-SUFFIX`, `IP-CIDR`, `FINAL`. */
  type: string;
  /** Matcher value (empty for value-less types like `FINAL`). */
  value: string;
  /** Target policy/proxy/group, or a built-in like `DIRECT`/`REJECT`. */
  policy: string;
  /** Trailing flags such as `no-resolve`, `dns-failed`. */
  options: string[];
}

/**
 * Simple matcher rule types offered in the editor's Type dropdown, grouped
 * roughly by what they match. Logical combinators (`AND`/`OR`/`NOT`) are NOT
 * here — they nest sub-rules and are built on the editor's dedicated Logical
 * tab; see {@link LOGICAL_RULE_TYPES} and {@link parseLogicalRule}.
 */
export const RULE_TYPES = [
  // Domain
  "DOMAIN",
  "DOMAIN-SUFFIX",
  "DOMAIN-KEYWORD",
  "DOMAIN-WILDCARD",
  "DOMAIN-SET",
  // IP
  "IP-CIDR",
  "IP-CIDR6",
  "IP-ASN",
  "GEOIP",
  // Connection / process
  "DEST-PORT",
  "SRC-PORT",
  "IN-PORT",
  "SRC-IP",
  "PROTOCOL",
  "PROCESS-NAME",
  "SUBNET",
  // Content
  "USER-AGENT",
  "URL-REGEX",
  // Resources / fallback
  "RULE-SET",
  "SCRIPT",
  "FINAL",
] as const;

/** Logical combinators, built on the editor's Logical tab. */
export const LOGICAL_RULE_TYPES = ["AND", "OR", "NOT"] as const;

/** Types that take no matcher value — the token after the type is the policy. */
const NO_VALUE_TYPES = new Set(["FINAL"]);

/** Logical combinators whose value nests parenthesised sub-rules. */
const LOGICAL_TYPES = new Set(["AND", "OR", "NOT"]);

/** True when `type` expects a matcher value (everything but FINAL). */
export function ruleTypeHasValue(type: string): boolean {
  return !NO_VALUE_TYPES.has(type.toUpperCase());
}

/** True when `type` is a logical combinator (edited as raw text only). */
export function isLogicalRuleType(type: string): boolean {
  return LOGICAL_TYPES.has(type.toUpperCase());
}

/** Common trailing rule flags, surfaced as toggles in the editor. */
export const RULE_OPTIONS = [
  "no-resolve",
  "dns-failed",
  "force-remote-dns",
  "pre-matching",
  "extended-matching",
] as const;

/** Built-in policies always selectable as a rule target. */
export const BUILTIN_POLICIES = [
  "DIRECT",
  "REJECT",
  "REJECT-TINYGIF",
  "REJECT-DROP",
  "REJECT-NO-DROP",
] as const;

/**
 * Parse a rule line into a {@link RuleLine}. Returns undefined when the rule
 * doesn't fit the flat shape — logical rules, or lines with too few tokens —
 * so the caller can fall back to raw editing.
 *
 *   "DOMAIN-SUFFIX,example.com,Proxy,no-resolve"
 *   "FINAL,Proxy,dns-failed"
 */
export function parseRuleLine(text: string): RuleLine | undefined {
  const tokens = text
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  const type = tokens[0];
  if (!type) return undefined;
  if (isLogicalRuleType(type)) return undefined;

  if (NO_VALUE_TYPES.has(type.toUpperCase())) {
    const policy = tokens[1];
    if (!policy) return undefined;
    return { type, value: "", policy, options: tokens.slice(2) };
  }
  // type, value, policy, [options…]
  if (tokens.length < 3) return undefined;
  return { type, value: tokens[1]!, policy: tokens[2]!, options: tokens.slice(3) };
}

/** Serialize a {@link RuleLine} back into a rule line (Surge's no-space style). */
export function serializeRuleLine(rule: RuleLine): string {
  const parts = [rule.type.trim()];
  if (ruleTypeHasValue(rule.type) && rule.value.trim()) parts.push(rule.value.trim());
  if (rule.policy.trim()) parts.push(rule.policy.trim());
  for (const opt of rule.options) {
    if (opt.trim()) parts.push(opt.trim());
  }
  return parts.join(",");
}

/* ------------------------------ Logical rules ----------------------------- */

/** One matcher inside a logical rule, e.g. `(DOMAIN,a.com)`. */
export interface LogicalSubRule {
  type: string;
  value: string;
}

/**
 * A logical rule: an `AND`/`OR`/`NOT` combinator over a list of sub-matchers,
 * targeting a policy. Syntax:
 *   `AND,((DOMAIN,a.com),(DEST-PORT,80)),Proxy`
 */
export interface LogicalRule {
  operator: string;
  conditions: LogicalSubRule[];
  policy: string;
  options: string[];
}

/**
 * Parse a logical rule into a {@link LogicalRule}. Returns undefined when the
 * line isn't a (single-level) logical rule, so the caller can fall back to raw
 * editing for deeply nested combinations.
 */
export function parseLogicalRule(text: string): LogicalRule | undefined {
  const t = text.trim();
  const m = /^(AND|OR|NOT)\s*,\s*\(/i.exec(t);
  if (!m) return undefined;
  const operator = m[1]!.toUpperCase();

  // Walk from the group's opening "(" to its matching close, tracking depth.
  const groupStart = m[0].length - 1;
  let depth = 0;
  let groupEnd = -1;
  for (let i = groupStart; i < t.length; i++) {
    if (t[i] === "(") depth++;
    else if (t[i] === ")" && --depth === 0) {
      groupEnd = i;
      break;
    }
  }
  if (groupEnd === -1) return undefined;

  const conditions = parseSubRules(t.slice(groupStart + 1, groupEnd));
  if (conditions.length === 0) return undefined;
  const rest = t
    .slice(groupEnd + 1)
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const policy = rest[0];
  if (!policy) return undefined;
  return { operator, conditions, policy, options: rest.slice(1) };
}

/** Extract top-level `(type,value)` sub-rules from a logical group's body. */
function parseSubRules(inner: string): LogicalSubRule[] {
  const subs: LogicalSubRule[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === "(") {
      if (depth === 0) start = i + 1;
      depth++;
    } else if (inner[i] === ")") {
      depth--;
      if (depth === 0 && start !== -1) {
        const body = inner.slice(start, i);
        const comma = body.indexOf(",");
        subs.push(
          comma === -1
            ? { type: body.trim(), value: "" }
            : { type: body.slice(0, comma).trim(), value: body.slice(comma + 1).trim() },
        );
        start = -1;
      }
    }
  }
  return subs.filter((s) => s.type);
}

/** Serialize a {@link LogicalRule} back into a rule line. */
export function serializeLogicalRule(rule: LogicalRule): string {
  const group = rule.conditions
    .map((c) => `(${[c.type.trim(), c.value.trim()].filter((p) => p).join(",")})`)
    .join(",");
  const parts = [rule.operator.trim(), `(${group})`, rule.policy.trim()];
  for (const opt of rule.options) {
    if (opt.trim()) parts.push(opt.trim());
  }
  return parts.join(",");
}
