import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCommandLine, shellQuote } from "../dist/commands.js";
import { parseRules, parseStatus, parseTraffic, formatBps } from "../dist/parsers.js";
import type { SurgeProfile } from "../dist/types.js";

const profile: SurgeProfile = { bin: "surge" };

test("buildCommandLine fills placeholders and quotes", () => {
  assert.equal(buildCommandLine(profile, "status"), "surge status --json");
  assert.equal(
    buildCommandLine(profile, "selectPolicy", ["Proxy Group", "🇯🇵 Tokyo"]),
    "surge policy select 'Proxy Group' '🇯🇵 Tokyo'",
  );
});

test("buildCommandLine enforces arity (injection guard)", () => {
  assert.throws(() => buildCommandLine(profile, "selectPolicy", ["only-one"]));
  assert.throws(() => buildCommandLine(profile, "status", ["extra"]));
});

test("shellQuote escapes single quotes", () => {
  assert.equal(shellQuote("a'b"), `'a'\\''b'`);
});

test("parseStatus handles json and text fallback", () => {
  assert.equal(parseStatus('{"running":true}').running, true);
  assert.equal(parseStatus("Surge is running").running, true);
  assert.equal(parseStatus("not running").running, false);
});

test("parseRules parses json and csv fallback", () => {
  const json = parseRules('[{"type":"FINAL","value":"","policy":"Proxy"}]');
  assert.equal(json[0]!.policy, "Proxy");
  const csv = parseRules("DOMAIN-SUFFIX,google.com,Proxy\n# comment\nFINAL,Direct");
  assert.equal(csv.length, 2);
  assert.equal(csv[0]!.value, "google.com");
  assert.equal(csv[1]!.type, "FINAL");
});

test("parseTraffic + formatBps", () => {
  const t = parseTraffic('{"uploadBps":2048,"downloadBps":1048576}');
  assert.equal(t.uploadBps, 2048);
  assert.equal(formatBps(2048), "2.0 KB/s");
  assert.equal(formatBps(1048576), "1.0 MB/s");
  assert.equal(formatBps(0), "0 B/s");
});
