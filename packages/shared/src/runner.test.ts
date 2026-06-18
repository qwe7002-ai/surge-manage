import assert from "node:assert/strict";
import { test } from "node:test";
import { CommandRunner, type TerminalChannel } from "../dist/runner.js";
import { buildCommandLine, shellQuote } from "../dist/commands.js";
import { parseRules, parseStatus, parseTraffic, formatBps } from "../dist/parsers.js";
import type { SurgeProfile } from "../dist/types.js";

const profile: SurgeProfile = { bin: "surge" };

/** A fake PTY that echoes writes and lets the test feed output back. */
class FakeChannel implements TerminalChannel {
  written: string[] = [];
  private listeners = new Set<(c: string) => void>();
  write(data: string): void {
    this.written.push(data);
  }
  onData(listener: (chunk: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  emit(chunk: string): void {
    for (const l of this.listeners) l(chunk);
  }
  /** Simulate the remote running the most recent framed command successfully. */
  replyLast(stdout: string, code = 0): void {
    const framed = this.written.at(-1)!;
    const id = /__SM_BEGIN__ %s\\n' '([^']+)'/.exec(framed)![1];
    this.emit(`\n__SM_BEGIN__ ${id}\n${stdout}\n__SM_END__ ${id} ${code}\n`);
  }
}

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

test("CommandRunner frames, captures output and exit code", async () => {
  const ch = new FakeChannel();
  const runner = new CommandRunner(ch, profile);
  const p = runner.run("status");
  assert.match(ch.written.at(-1)!, /__SM_BEGIN__/);
  ch.replyLast('{"running":true,"version":"5.0"}');
  const res = await p;
  assert.equal(res.exitCode, 0);
  assert.equal(res.action, "status");
  assert.ok(res.stdout.includes("running"));
  runner.dispose();
});

test("CommandRunner serializes concurrent commands", async () => {
  const ch = new FakeChannel();
  const runner = new CommandRunner(ch, profile);
  const p1 = runner.run("version");
  const p2 = runner.run("status");
  // Only the first command should be in flight.
  assert.equal(ch.written.length, 1);
  ch.replyLast("surge 5.0.0");
  const r1 = await p1;
  assert.equal(r1.stdout, "surge 5.0.0");
  // Now the second is dispatched.
  assert.equal(ch.written.length, 2);
  ch.replyLast('{"running":false}');
  const r2 = await p2;
  assert.equal(r2.action, "status");
  runner.dispose();
});

test("CommandRunner times out", async () => {
  const ch = new FakeChannel();
  const runner = new CommandRunner(ch, profile);
  await assert.rejects(runner.run("status", [], 20), /timed out/);
  runner.dispose();
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
