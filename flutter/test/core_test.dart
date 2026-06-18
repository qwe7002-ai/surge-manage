import 'package:flutter_test/flutter_test.dart';
import 'package:surge_manage/core/commands.dart';
import 'package:surge_manage/core/parsers.dart';
import 'package:surge_manage/core/types.dart';

const profile = SurgeProfile();

void main() {
  test('buildCommandLine maps to real surge commands with --raw', () {
    expect(buildCommandLine(profile, SurgeAction.environment),
        'surge-cli --raw environment');
    expect(buildCommandLine(profile, SurgeAction.dumpPolicy),
        'surge-cli --raw dump policy');
    expect(buildCommandLine(profile, SurgeAction.reload), 'surge-cli reload');
    expect(
      buildCommandLine(profile, SurgeAction.switchProfile, ['Home Profile']),
      "surge-cli switch-profile 'Home Profile'",
    );
  });

  test('buildCommandLine enforces arity', () {
    expect(
      () => buildCommandLine(profile, SurgeAction.testPolicy, []),
      throwsArgumentError,
    );
  });

  test('shellQuote escapes single quotes', () {
    expect(shellQuote("a'b"), "'a'\\''b'");
  });

  test('parseEnvironment flattens json', () {
    final env = parseEnvironment('{"system-proxy":true,"outbound-mode":"rule"}');
    expect(env.fields['outbound-mode'], 'rule');
    expect(env.fields['system-proxy'], 'true');
  });

  test('parsePolicies reads proxies + policy-groups', () {
    final dump = parsePolicies(
      '{"proxies":["UK","US","CA"],"policy-groups":["Relay","Apple"]}',
    );
    expect(dump.proxies, ['UK', 'US', 'CA']);
    expect(dump.groups, ['Relay', 'Apple']);
  });

  test('parsePolicyTests reads latency + error', () {
    final tests = parsePolicyTests(
      '{"UK":{"tcp":66,"receive":415,"available":69,"round-one-total":1055},'
      '"CA":{"error":"Socket closed by remote peer","available":0}}',
    );
    final uk = tests.firstWhere((t) => t.name == 'UK');
    expect(uk.tcpMs, 66);
    expect(uk.receiveMs, 415);
    final ca = tests.firstWhere((t) => t.name == 'CA');
    expect(ca.error, 'Socket closed by remote peer');
  });

  test('parseActive + aggregateTraffic', () {
    final conns = parseActive(
      '[{"id":"1","remoteAddress":"a:443","inBytes":1000,"outBytes":500},'
      '{"id":"2","remoteAddress":"b:80","inBytes":2000,"outBytes":100}]',
    );
    expect(conns.length, 2);
    final t = aggregateTraffic(conns);
    expect(t.connections, 2);
    expect(t.downloadTotal, 3000);
    expect(t.uploadTotal, 600);
  });
}
