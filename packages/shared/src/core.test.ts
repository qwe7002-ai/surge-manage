import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCommandLine, shellQuote } from "../dist/commands.js";
import {
  aggregateTraffic,
  parseActive,
  parseEnvironment,
  parsePolicies,
  parsePolicyTests,
  parseRules,
  parseSubPolicies,
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
