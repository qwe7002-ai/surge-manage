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

/** Rule matcher types offered in the editor, grouped roughly by what they match. */
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
  // Resources / logic / fallback
  "RULE-SET",
  "SCRIPT",
  "AND",
  "OR",
  "NOT",
  "FINAL",
] as const;

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
