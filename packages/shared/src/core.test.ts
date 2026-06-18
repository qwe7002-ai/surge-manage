import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCommandLine, shellQuote } from "../dist/commands.js";
import {
  aggregateTraffic,
  parseActive,
  parseEnvironment,
  parseExternalResources,
  parseConfigProxies,
  parsePolicies,
  parsePolicyTests,
  parseProxyGroups,
  parseRules,
  parseSubPolicies,
  parseTempRules,
} from "../dist/parsers.js";
import type { SurgeProfile } from "../dist/types.js";

const profile: SurgeProfile = { bin: "surge" };

test("buildCommandLine maps to real surge commands with --raw", () => {
  assert.equal(buildCommandLine(profile, "environment"), "surge --raw environment");
  assert.equal(buildCommandLine(profile, "dumpPolicy"), "surge --raw dump policy");
  assert.equal(buildCommandLine(profile, "reload"), "surge reload");
  assert.equal(
    buildCommandLine(profile, "switchProfile", ["Home Profile"]),
    "surge switch-profile 'Home Profile'",
  );
  assert.equal(buildCommandLine(profile, "kill", ["42"]), "surge kill 42");
  // `set` takes a single key=value token.
  assert.equal(
    buildCommandLine(profile, "setEnvironment", ["ProxyGroupSelection.Proxy=HK"]),
    "surge set ProxyGroupSelection.Proxy=HK",
  );
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
    '{"environment":{"ProxyMode":2,"ProxyGroupSelection":{"Proxy":"HK"},"MitMEnabled":1}}',
  );
  assert.equal(env.proxyMode, 2);
  assert.equal(env.selection["Proxy"], "HK");
  assert.equal(env.fields["MitMEnabled"], "1");
  // Also works without the envelope wrapper.
  const flat = parseEnvironment('{"ProxyMode":0}');
  assert.equal(flat.proxyMode, 0);
});

test("parseProxyGroups reads [Proxy Group] members from config", () => {
  const cfg = `
# comment
[Proxy]
HK = trojan, hk.example.com, 443, password=x
US = ss, us.example.com, 8388

[Proxy Group]
Proxy = select, HK, US, DIRECT
Auto = url-test, HK, US, url = http://t.com, interval=300

[Rule]
FINAL,Proxy
`;
  const groups = parseProxyGroups(cfg);
  assert.deepEqual(groups["Proxy"], ["HK", "US", "DIRECT"]);
  // group type dropped, and `url=`/`interval=` option tokens excluded.
  assert.deepEqual(groups["Auto"], ["HK", "US"]);
  assert.deepEqual(parseConfigProxies(cfg), ["HK", "US"]);
});

test("parseSubPolicies maps group → members", () => {
  const subs = parseSubPolicies('{"Proxy":["HK","US"],"Apple":{"all":["DIRECT","Proxy"]}}');
  assert.deepEqual(subs["Proxy"], ["HK", "US"]);
  assert.deepEqual(subs["Apple"], ["DIRECT", "Proxy"]);
});

test("parsePolicies reads proxies + policy-groups names", () => {
  const dump = parsePolicies(
    '{"proxies":["UK","US","CA"],"policy-groups":["Relay","Apple","FINAL"]}',
  );
  assert.deepEqual(dump.proxies, ["UK", "US", "CA"]);
  assert.deepEqual(dump.groups, ["Relay", "Apple", "FINAL"]);
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
});

test("parseExternalResources reads key/ready/updatedAt", () => {
  const r = parseExternalResources(
    '[{"key":"abc","url":"https://x/list","ready":true,"updatedAt":1700000000000}]',
  );
  assert.equal(r[0]!.key, "abc");
  assert.equal(r[0]!.ready, true);
  assert.equal(r[0]!.updatedAt, 1700000000000);
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
