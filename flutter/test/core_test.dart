import 'package:flutter_test/flutter_test.dart';
import 'package:surge_manage/core/commands.dart';
import 'package:surge_manage/core/config_doc.dart';
import 'package:surge_manage/core/parsers.dart';
import 'package:surge_manage/core/types.dart';

const profile = SurgeProfile();

void main() {
  test('buildCommandLine maps to real surge commands with --raw', () {
    expect(buildCommandLine(profile, SurgeAction.environment),
        'surge-cli --raw environment');
    expect(buildCommandLine(profile, SurgeAction.dumpPolicy),
        'surge-cli --raw dump policy');
    expect(buildCommandLine(profile, SurgeAction.dumpEvent),
        'surge-cli --raw dump event');
    expect(buildCommandLine(profile, SurgeAction.dumpVirtualIpDb),
        'surge-cli --raw dump virtual-ip-db');
    expect(buildCommandLine(profile, SurgeAction.reload), 'surge-cli reload');
    expect(buildCommandLine(profile, SurgeAction.unattendedUpgrade),
        'surge-cli unattended-upgrade');
    expect(
      buildCommandLine(profile, SurgeAction.switchProfile, ['Home Profile']),
      "surge-cli switch-profile 'Home Profile'",
    );
    expect(
      buildCommandLine(
        profile,
        SurgeAction.setEnvironment,
        ['ProxyGroupSelection.Proxy', 'HK'],
      ),
      'surge-cli set ProxyGroupSelection.Proxy HK',
    );
    expect(
      buildCommandLine(profile, SurgeAction.scriptEvaluate, ['/tmp/test.js']),
      'surge-cli script evaluate /tmp/test.js',
    );
    expect(
      buildCommandLine(profile, SurgeAction.checkProfile, ['/tmp/Profile.conf']),
      'surge-cli --check /tmp/Profile.conf',
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

  test('parseActive reads Surge {requests:[...]} envelope with numeric ids', () {
    final conns = parseActive(
      '{"requests":[{"id":42,"remoteAddress":"a:443","policyName":"HK",'
      '"inBytes":1000,"outBytes":500}]}',
    );
    expect(conns.length, 1);
    expect(conns[0].id, '42');
    expect(conns[0].policy, 'HK');
    expect(conns[0].downloadBytes, 1000);
  });

  test('parseRules reads the {rules:[...]} envelope of rule strings', () {
    final rules = parseRules(
      '{"rules":["DOMAIN-SUFFIX,google.com,Proxy","GEOIP,CN,DIRECT",'
      '"FINAL,Proxy,dns-failed"]}',
    );
    expect(rules.length, 3);
    expect(rules[0].type, 'DOMAIN-SUFFIX');
    expect(rules[0].value, 'google.com');
    expect(rules[0].policy, 'Proxy');
    // FINAL has no matcher value: the token after FINAL is the policy.
    expect(rules[2].type, 'FINAL');
    expect(rules[2].value, '');
    expect(rules[2].policy, 'Proxy');
  });

  test('config-doc round-trips and edits one section', () {
    const text = '# header\n[General]\nloglevel = notify\n\n'
        '[Proxy]\nHK = trojan, hk.com, 443\n[Rule]\nFINAL,Proxy';
    final doc = parseConfigDocument(text);
    expect(getSectionEntries(doc, 'Proxy'), ['HK = trojan, hk.com, 443']);
    final edited = setSectionEntries(doc, 'Rule', ['DOMAIN,a.com,DIRECT', 'FINAL,Proxy']);
    final out = serializeConfigDocument(edited);
    expect(out.contains('# header'), isTrue);
    expect(out.contains('loglevel = notify'), isTrue);
    expect(out.contains('DOMAIN,a.com,DIRECT'), isTrue);
    expect(out.contains('HK = trojan, hk.com, 443'), isTrue);
  });

  test('getRuleEntries classifies rules, disabled rules and comments', () {
    const text = '[Rule]\n# === Streaming ===\nDOMAIN-SUFFIX,active.com,Proxy\n'
        '# DOMAIN-SUFFIX,disabled.com,DIRECT\n\nFINAL,Proxy';
    final doc = parseConfigDocument(text);
    final rules = getRuleEntries(doc, 'Rule');
    expect(rules.map((r) => '${r.text}|${r.enabled}|${r.comment}').toList(), [
      '=== Streaming ===|false|true',
      'DOMAIN-SUFFIX,active.com,Proxy|true|false',
      'DOMAIN-SUFFIX,disabled.com,DIRECT|false|false',
      'FINAL,Proxy|true|false',
    ]);
    final toggled = rules
        .map((r) => r.comment ? r : r.copyWith(enabled: !r.enabled))
        .toList();
    final out = serializeConfigDocument(setRuleEntries(doc, 'Rule', toggled));
    expect(out.contains('# === Streaming ==='), isTrue);
    expect(out.contains('# DOMAIN-SUFFIX,active.com,Proxy'), isTrue);
    expect(out.contains('\nDOMAIN-SUFFIX,disabled.com,DIRECT'), isTrue);
    final reparsed = getRuleEntries(parseConfigDocument(out), 'Rule');
    expect(reparsed.map((r) => '${r.text}|${r.enabled}|${r.comment}').toList(),
        toggled.map((r) => '${r.text}|${r.enabled}|${r.comment}').toList());
  });

  test('buildCommandLine adds --raw to test commands', () {
    expect(buildCommandLine(profile, SurgeAction.testNetwork),
        'surge-cli --raw test-network');
    expect(buildCommandLine(profile, SurgeAction.testAllPolicies),
        'surge-cli --raw test-all-policies');
    expect(buildCommandLine(profile, SurgeAction.testPolicy, ['HK']),
        'surge-cli --raw test-policy HK');
    expect(buildCommandLine(profile, SurgeAction.testGroup, ['FINAL']),
        'surge-cli --raw test-group FINAL');
  });
}
