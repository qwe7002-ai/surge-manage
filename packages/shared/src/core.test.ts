import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCommandArgv, buildCommandLine, shellQuote } from "../dist/commands.js";
import {
  aggregateTraffic,
  parseActive,
  parseEnvironment,
  parseExternalResources,
  parsePolicies,
  parsePolicyTests,
  parseRules,
  parseSmartGroupTypes,
  parseSubPolicies,
  parseTempRules,
} from "../dist/parsers.js";
import {
  getRuleEntries,
  getPolicyGroupTypes,
  getSectionEntries,
  parseConfigDocument,
  serializeConfigDocument,
  setRuleEntries,
  setSectionEntries,
} from "../dist/config-doc.js";
import {
  getProxyParam,
  groupedProxyFields,
  isRestrictedProtocol,
  parseProxyLine,
  protocolUsesServer,
  proxyFieldsFor,
  serializeProxyLine,
  setProxyParam,
} from "../dist/proxy.js";
import { parseInterfaces } from "../dist/parsers.js";
import type { SurgeProfile } from "../dist/types.js";

const profile: SurgeProfile = { bin: "surge" };

test("buildCommandLine maps to real surge commands with --raw", () => {
  assert.equal(buildCommandLine(profile, "environment"), "surge --raw environment");
  assert.equal(buildCommandLine(profile, "dumpPolicy"), "surge --raw dump policy");
  assert.equal(buildCommandLine(profile, "dumpEvent"), "surge --raw dump event");
  assert.equal(
    buildCommandLine(profile, "dumpVirtualIpDb"),
    "surge --raw dump virtual-ip-db",
  );
  assert.equal(buildCommandLine(profile, "reload"), "surge reload");
  assert.equal(buildCommandLine(profile, "unattendedUpgrade"), "surge unattended-upgrade");
  assert.equal(
    buildCommandLine(profile, "switchProfile", ["Home Profile"]),
    "surge switch-profile 'Home Profile'",
  );
  assert.equal(buildCommandLine(profile, "kill", ["42"]), "surge kill 42");
  // `set` takes `key=value` tokens.
  assert.equal(
    buildCommandLine(profile, "setEnvironment", ["ProxyGroupSelection.Proxy=HK"]),
    "surge set ProxyGroupSelection.Proxy=HK",
  );
  assert.equal(
    buildCommandLine(profile, "scriptEvaluate", ["/tmp/test.js"]),
    "surge script evaluate /tmp/test.js",
  );
  assert.equal(
    buildCommandLine(profile, "checkProfile", ["/tmp/Profile.conf"]),
    "surge --check /tmp/Profile.conf",
  );
});

test("buildCommandArgv returns unquoted tokens for local execution", () => {
  assert.deepEqual(buildCommandArgv(profile, "switchProfile", ["Home Profile"]), [
    "surge",
    "switch-profile",
    "Home Profile",
  ]);
  assert.deepEqual(buildCommandArgv(profile, "checkProfile", ["/tmp/Profile.conf"]), [
    "surge",
    "--check",
    "/tmp/Profile.conf",
  ]);
});

test("buildCommandLine enforces arity (injection guard)", () => {
  assert.throws(() => buildCommandLine(profile, "testPolicy", []));
  assert.throws(() => buildCommandLine(profile, "environment", ["extra"]));
});

test("shellQuote escapes single quotes", () => {
  assert.equal(shellQuote("a'b"), `'a'\\''b'`);
});

test("parseEnvironment flattens, unwraps envelope, extracts selection/mode", () => {
  const env = parseEnvironment(
    '{"environment":{"ProxyMode":2,"AllProxyModePolicyNameKey":"US","ProxyGroupSelection":{"Proxy":"HK"},"AutoPolicyGroupOverride":{"NAME":"US"},"MitMEnabled":1}}',
  );
  assert.equal(env.proxyMode, 2);
  assert.equal(env.globalPolicy, "US");
  assert.equal(env.selection["Proxy"], "HK");
  assert.equal(env.autoOverride["NAME"], "US");
  assert.equal(env.fields["MitMEnabled"], "1");
  // Also works without the envelope wrapper.
  const flat = parseEnvironment('{"ProxyMode":0}');
  assert.equal(flat.proxyMode, 0);
});

test("config-doc round-trips and edits one section without clobbering others", () => {
  const text = [
    "# header comment",
    "[General]",
    "loglevel = notify",
    "",
    "[Proxy]",
    "HK = trojan, hk.com, 443",
    "[Rule]",
    "FINAL,Proxy",
  ].join("\n");
  const doc = parseConfigDocument(text);
  assert.deepEqual(getSectionEntries(doc, "Proxy"), ["HK = trojan, hk.com, 443"]);
  // Editing [Rule] must preserve [General] and its comment/blank lines.
  const edited = setSectionEntries(doc, "Rule", [
    "DOMAIN,a.com,DIRECT",
    "FINAL,Proxy",
  ]);
  const out = serializeConfigDocument(edited);
  assert.ok(out.includes("# header comment"));
  assert.ok(out.includes("loglevel = notify"));
  assert.ok(out.includes("DOMAIN,a.com,DIRECT"));
  assert.ok(out.includes("HK = trojan, hk.com, 443"));
  // A section added when absent is appended.
  const withDns = setSectionEntries(doc, "DNS", ["server = 1.1.1.1"]);
  assert.ok(serializeConfigDocument(withDns).includes("[DNS]"));
});

test("getPolicyGroupTypes reads proxy group declaration types", () => {
  const doc = parseConfigDocument(
    [
      "[Proxy Group]",
      "Relay = select, DIRECT, OUS",
      "Apple = smart, US, CA",
      "Auto = url-test, US, CA",
    ].join("\n"),
  );
  assert.deepEqual(getPolicyGroupTypes(doc), {
    Relay: "select",
    Apple: "smart",
    Auto: "url-test",
  });
});

test("getRuleEntries classifies rules, disabled rules and plain comments", () => {
  const text = [
    "[Rule]",
    "# === Streaming ===",
    "DOMAIN-SUFFIX,active.com,Proxy",
    "# DOMAIN-SUFFIX,disabled.com,DIRECT",
    "",
    "FINAL,Proxy",
  ].join("\n");
  const doc = parseConfigDocument(text);
  const rules = getRuleEntries(doc, "Rule");
  assert.deepEqual(rules, [
    { text: "=== Streaming ===", enabled: false, comment: true },
    { text: "DOMAIN-SUFFIX,active.com,Proxy", enabled: true, comment: false },
    { text: "DOMAIN-SUFFIX,disabled.com,DIRECT", enabled: false, comment: false },
    { text: "FINAL,Proxy", enabled: true, comment: false },
  ]);
  // Toggling rules and keeping the comment must survive a write → read trip.
  const toggled = rules.map((r) =>
    r.comment ? r : { ...r, enabled: !r.enabled },
  );
  const out = serializeConfigDocument(setRuleEntries(doc, "Rule", toggled));
  assert.ok(out.includes("# === Streaming ==="));
  assert.ok(out.includes("# DOMAIN-SUFFIX,active.com,Proxy"));
  assert.ok(out.includes("\nDOMAIN-SUFFIX,disabled.com,DIRECT"));
  assert.deepEqual(getRuleEntries(parseConfigDocument(out), "Rule"), toggled);
});

test("parseSubPolicies maps group → members", () => {
  const subs = parseSubPolicies('{"Proxy":["HK","US"],"Apple":{"all":["DIRECT","Proxy"]}}');
  assert.deepEqual(subs["Proxy"], ["HK", "US"]);
  assert.deepEqual(subs["Apple"], ["DIRECT", "Proxy"]);
  const surge = parseSubPolicies(
    '{"map":{"Relay":[{"name":"DIRECT","isGroup":false},{"name":"OUS","isGroup":true}]}}',
  );
  assert.deepEqual(surge["Relay"], ["DIRECT", "OUS"]);
});

test("parsePolicies reads proxies + policy-groups names", () => {
  const dump = parsePolicies(
    '{"proxies":["UK","US","CA"],"policy-groups":["Relay","Apple","FINAL"]}',
  );
  assert.deepEqual(dump.proxies, ["UK", "US", "CA"]);
  assert.deepEqual(dump.groups, ["Relay", "Apple", "FINAL"]);
});

test("parseSmartGroupTypes reads smart group names", () => {
  const groups = parseSmartGroupTypes(
    '{"Apple":{"POLICY::a":{"usage":0}},"Warp":{"POLICY::b":{"usage":1}},"report":{"Apple":{}}}',
  );
  assert.deepEqual(groups, { Apple: "smart", Warp: "smart" });
});

test("parsePolicyTests reads latency + error per proxy", () => {
  const tests = parsePolicyTests(
    '{"UK":{"tfo":false,"tcp":66,"receive":415,"available":69,"round-one-total":1055},' +
      '"CA":{"error":"Socket closed by remote peer","available":0}}',
  );
  const uk = tests.find((t) => t.name === "UK")!;
  assert.equal(uk.tcpMs, 66);
  assert.equal(uk.receiveMs, 415);
  assert.equal(uk.available, 69);
  const ca = tests.find((t) => t.name === "CA")!;
  assert.equal(ca.error, "Socket closed by remote peer");
});

test("parseRules parses json and csv fallback", () => {
  const json = parseRules('[{"type":"FINAL","value":"","policy":"Proxy"}]');
  assert.equal(json[0]!.policy, "Proxy");
  const wrapped = parseRules('{"rules":["DOMAIN-SUFFIX,apache.org,emome","FINAL,FINAL"]}');
  assert.equal(wrapped.length, 2);
  assert.equal(wrapped[0]!.value, "apache.org");
  const csv = parseRules("DOMAIN-SUFFIX,google.com,Proxy\n# comment\nFINAL,Direct");
  assert.equal(csv.length, 2);
  assert.equal(csv[0]!.value, "google.com");
  assert.equal(csv[1]!.type, "FINAL");
});

test("parseRules reads the {rules:[...]} envelope of rule strings", () => {
  const rules = parseRules(
    '{"rules":["DOMAIN-SUFFIX,google.com,Proxy","GEOIP,CN,DIRECT","FINAL,Proxy,dns-failed"]}',
  );
  assert.equal(rules.length, 3);
  assert.equal(rules[0]!.type, "DOMAIN-SUFFIX");
  assert.equal(rules[0]!.value, "google.com");
  assert.equal(rules[0]!.policy, "Proxy");
  // FINAL has no matcher value: the token after FINAL is the policy.
  assert.equal(rules[2]!.type, "FINAL");
  assert.equal(rules[2]!.value, "");
  assert.equal(rules[2]!.policy, "Proxy");
});

test("parseTempRules handles strings, objects, and text", () => {
  assert.deepEqual(parseTempRules('["DOMAIN,a.com,Proxy"]'), ["DOMAIN,a.com,Proxy"]);
  assert.deepEqual(
    parseTempRules('[{"type":"DOMAIN-SUFFIX","value":"b.com","policy":"DIRECT"}]'),
    ["DOMAIN-SUFFIX,b.com,DIRECT"],
  );
  assert.deepEqual(parseTempRules("DOMAIN,c.com,Proxy\n# c\n"), ["DOMAIN,c.com,Proxy"]);
  assert.deepEqual(parseTempRules('{"rules":["DOMAIN,d.com,Proxy"]}'), ["DOMAIN,d.com,Proxy"]);
});

test("parseExternalResources reads key/ready/updatedAt", () => {
  const r = parseExternalResources(
    '[{"key":"abc","url":"https://x/list","ready":true,"updatedAt":1700000000000}]',
  );
  assert.equal(r[0]!.key, "abc");
  assert.equal(r[0]!.ready, true);
  assert.equal(r[0]!.updatedAt, 1700000000000);
  const wrapped = parseExternalResources(
    '{"defines":[{"key":"def","path":"https://x/remote.conf","ready":true,"updatedAt":1781776850.1813831}]}',
  );
  assert.equal(wrapped[0]!.url, "https://x/remote.conf");
});

test("buildCommandLine for temp-rule and external-resource", () => {
  assert.equal(
    buildCommandLine(profile, "addTempRule", ["DOMAIN,a.com,Proxy"]),
    "surge add-temp-rule 'DOMAIN,a.com,Proxy'",
  );
  assert.equal(
    buildCommandLine(profile, "externalResourceUpdate", ["abc"]),
    "surge external-resource update abc",
  );
  assert.equal(
    buildCommandLine(profile, "externalResourceUpdateAll"),
    "surge external-resource update all",
  );
});

test("buildCommandLine aligns with raw test commands", () => {
  assert.equal(buildCommandLine(profile, "testNetwork"), "surge --raw test-network");
  assert.equal(
    buildCommandLine(profile, "testGroup", ["FINAL"]),
    "surge --raw test-group FINAL",
  );
});

test("parseActive + aggregateTraffic", () => {
  const conns = parseActive(
    '[{"id":"1","remoteAddress":"a:443","policy":"Proxy","inBytes":1000,"outBytes":500},' +
      '{"id":"2","remoteAddress":"b:80","policy":"DIRECT","inBytes":2000,"outBytes":100}]',
  );
  assert.equal(conns.length, 2);
  assert.equal(conns[0]!.remote, "a:443");
  const t = aggregateTraffic(conns);
  assert.equal(t.connections, 2);
  assert.equal(t.downloadTotal, 3000);
  assert.equal(t.uploadTotal, 600);
  const surge = parseActive(
    '{"requests":[{"id":509447,"remoteHost":"kws2.web.telegram.org:443","policyName":"asia-warp","inBytes":60076,"outBytes":82746}]}',
  );
  assert.equal(surge[0]!.id, "509447");
  assert.equal(surge[0]!.remote, "kws2.web.telegram.org:443");
  assert.equal(surge[0]!.policy, "asia-warp");
});

test("parseActive reads Surge {requests:[...]} envelope with numeric ids", () => {
  const conns = parseActive(
    '{"requests":[{"id":42,"remoteAddress":"a:443","policyName":"HK",' +
      '"inBytes":1000,"outBytes":500}]}',
  );
  assert.equal(conns.length, 1);
  assert.equal(conns[0]!.id, "42"); // numeric id coerced to string for `kill`
  assert.equal(conns[0]!.policy, "HK");
  assert.equal(conns[0]!.downloadBytes, 1000);
});

test("parseProxyLine splits server/port and key=value params", () => {
  const c = parseProxyLine(
    "asia-warp = ss, asia.reallsys.eu, 30000, encrypt-method=2022-blake3-aes-128-gcm, password=secret, udp-relay=true",
  )!;
  assert.equal(c.name, "asia-warp");
  assert.equal(c.type, "ss");
  assert.equal(c.server, "asia.reallsys.eu");
  assert.equal(c.port, "30000");
  assert.equal(getProxyParam(c, "encrypt-method"), "2022-blake3-aes-128-gcm");
  assert.equal(getProxyParam(c, "udp-relay"), "true");
  assert.deepEqual(c.extraPositional, []);
});

test("parseProxyLine keeps positional args for server-less protocols", () => {
  const c = parseProxyLine("Local = direct")!;
  assert.equal(c.type, "direct");
  assert.equal(c.server, undefined);
  assert.equal(protocolUsesServer("direct"), false);
});

test("serializeProxyLine round-trips a parsed line", () => {
  const line =
    "HK = trojan, hk.example.com, 443, password=p, sni=hk.example.com, skip-cert-verify=true";
  const c = parseProxyLine(line)!;
  assert.equal(serializeProxyLine(c), line);
});

test("setProxyParam updates, appends, and removes by case-insensitive key", () => {
  let c = parseProxyLine("HK = ss, h, 1, password=a")!;
  c = setProxyParam(c, "password", "b");
  assert.equal(getProxyParam(c, "password"), "b");
  c = setProxyParam(c, "udp-relay", "true");
  assert.equal(getProxyParam(c, "udp-relay"), "true");
  c = setProxyParam(c, "Password", ""); // empty removes (case-insensitive)
  assert.equal(getProxyParam(c, "password"), undefined);
  assert.equal(serializeProxyLine(c), "HK = ss, h, 1, udp-relay=true");
});

test("parseProxyLine returns undefined for malformed entries", () => {
  assert.equal(parseProxyLine("no-equals-here"), undefined);
  assert.equal(parseProxyLine("= ss, h, 1"), undefined);
});

test("proxyFieldsFor restricts direct to the bind-interface field", () => {
  const direct = proxyFieldsFor("direct");
  assert.deepEqual(
    direct.map((f) => f.key),
    ["interface"],
  );
  assert.equal(isRestrictedProtocol("direct"), true);
  assert.equal(isRestrictedProtocol("ss"), false);
});

test("proxyFieldsFor returns protocol-specific fields before common ones", () => {
  const ss = proxyFieldsFor("ss").map((f) => f.key);
  // ss-specific keys lead, then the shared/common parameters.
  assert.deepEqual(ss.slice(0, 5), [
    "encrypt-method",
    "password",
    "obfs",
    "obfs-host",
    "obfs-uri",
  ]);
  assert.ok(ss.includes("test-url")); // common
  assert.ok(ss.includes("ip-version")); // common
  // ws-only protocols don't surface ss-only fields.
  const vmess = proxyFieldsFor("vmess").map((f) => f.key);
  assert.ok(vmess.includes("ws") && vmess.includes("vmess-aead"));
  assert.ok(vmess.includes("encrypt-method")); // vmess uses encrypt-method
  assert.ok(!vmess.includes("psk")); // psk is snell-only
  // WireGuard references a section and takes no server/port.
  assert.deepEqual(proxyFieldsFor("wireguard")[0]!.key, "section-name");
  assert.equal(protocolUsesServer("wireguard"), false);
  // Unknown protocols still get the common set.
  assert.ok(proxyFieldsFor("mystery").some((f) => f.key === "test-url"));
});

test("block-quic defaults to Auto (absence) and underlying-proxy is a policy select", () => {
  const fields = proxyFieldsFor("ss");
  const blockQuic = fields.find((f) => f.key === "block-quic")!;
  assert.equal(blockQuic.defaultValue, "auto");
  // The Auto option carries the empty value so absence == auto.
  assert.equal(blockQuic.options![0]!.value, "");
  assert.equal(blockQuic.options![0]!.label, "Auto");
  const underlying = fields.find((f) => f.key === "underlying-proxy")!;
  assert.equal(underlying.kind, "policy");
});

test("parseInterfaces handles macOS ifconfig -l and Linux /sys/class/net", () => {
  assert.deepEqual(parseInterfaces("lo0 en0 en1 utun0"), ["en0", "en1", "lo0", "utun0"]);
  assert.deepEqual(parseInterfaces("eth0\nlo\nwg0\n"), ["eth0", "lo", "wg0"]);
  assert.deepEqual(parseInterfaces("  "), []);
});

test("groupedProxyFields buckets fields into ordered sections", () => {
  const groups = groupedProxyFields("ss");
  const ids = groups.map((g) => g.id);
  // Order follows PROXY_FIELD_GROUPS; ss has auth, obfs, chain, testing, egress, options.
  assert.deepEqual(ids, ["auth", "obfs", "chain", "testing", "egress", "options"]);
  const egress = groups.find((g) => g.id === "egress")!;
  assert.ok(egress.fields.some((f) => f.key === "interface"));
  // direct collapses to a single Egress group with just the interface field.
  const direct = groupedProxyFields("direct");
  assert.deepEqual(direct.map((g) => g.id), ["egress"]);
  assert.deepEqual(direct[0].fields.map((f) => f.key), ["interface"]);
});
