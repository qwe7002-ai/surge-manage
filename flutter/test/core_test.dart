import 'package:flutter_test/flutter_test.dart';
import 'package:surge_manage/core/commands.dart';
import 'package:surge_manage/core/parsers.dart';
import 'package:surge_manage/core/types.dart';

const profile = SurgeProfile();

void main() {
  test('buildCommandLine fills placeholders and quotes', () {
    expect(buildCommandLine(profile, SurgeAction.status), 'surge status --json');
    expect(
      buildCommandLine(profile, SurgeAction.selectPolicy, ['Proxy Group', 'Tokyo 01']),
      "surge policy select 'Proxy Group' 'Tokyo 01'",
    );
  });

  test('buildCommandLine enforces arity', () {
    expect(
      () => buildCommandLine(profile, SurgeAction.selectPolicy, ['one']),
      throwsArgumentError,
    );
  });

  test('shellQuote escapes single quotes', () {
    expect(shellQuote("a'b"), "'a'\\''b'");
  });

  test('parseStatus json and text fallback', () {
    expect(parseStatus('{"running":true}').running, true);
    expect(parseStatus('Surge is running').running, true);
    expect(parseStatus('not running').running, false);
  });

  test('parseRules json and csv fallback', () {
    final json = parseRules('[{"type":"FINAL","value":"","policy":"Proxy"}]');
    expect(json.first.policy, 'Proxy');
    final csv = parseRules('DOMAIN-SUFFIX,google.com,Proxy\n# c\nFINAL,Direct');
    expect(csv.length, 2);
    expect(csv[0].value, 'google.com');
    expect(csv[1].type, 'FINAL');
  });

  test('formatBps', () {
    expect(formatBps(2048), '2.0 KB/s');
    expect(formatBps(1048576), '1.0 MB/s');
    expect(formatBps(0), '0 B/s');
  });
}
