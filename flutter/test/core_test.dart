import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:surge_manage/core/channel.dart';
import 'package:surge_manage/core/commands.dart';
import 'package:surge_manage/core/parsers.dart';
import 'package:surge_manage/core/runner.dart';
import 'package:surge_manage/core/types.dart';

const profile = SurgeProfile();

/// Fake channel that records writes and lets tests feed framed replies back.
class FakeChannel implements TerminalChannel {
  final _controller = StreamController<String>.broadcast();
  final List<String> written = [];

  @override
  Stream<String> get output => _controller.stream;

  @override
  void write(String data) => written.add(data);

  @override
  Future<void> resize(int cols, int rows) async {}

  @override
  Future<void> close() async => _controller.close();

  void replyLast(String stdout, [int code = 0]) {
    final framed = written.last;
    final id = RegExp(r"__SM_BEGIN__ %s\\n' '([^']+)'").firstMatch(framed)!.group(1);
    _controller.add('\n__SM_BEGIN__ $id\n$stdout\n__SM_END__ $id $code\n');
  }
}

void main() {
  test('buildCommandLine fills placeholders and quotes', () {
    expect(buildCommandLine(profile, SurgeAction.status), 'surge status --json');
    expect(
      buildCommandLine(profile, SurgeAction.selectPolicy, ['Proxy Group', 'Tokyo 01']),
      "surge policy select 'Proxy Group' 'Tokyo 01'",
    );
  });

  test('buildCommandLine enforces arity', () {
    expect(() => buildCommandLine(profile, SurgeAction.selectPolicy, ['one']),
        throwsArgumentError);
  });

  test('runner frames, captures output and exit code', () async {
    final ch = FakeChannel();
    final runner = CommandRunner(ch, profile);
    final future = runner.run(SurgeAction.status);
    expect(ch.written.last, contains('__SM_BEGIN__'));
    ch.replyLast('{"running":true,"version":"5.0"}');
    final res = await future;
    expect(res.exitCode, 0);
    expect(res.stdout, contains('running'));
    await runner.dispose();
  });

  test('runner serializes concurrent commands', () async {
    final ch = FakeChannel();
    final runner = CommandRunner(ch, profile);
    final p1 = runner.run(SurgeAction.version);
    runner.run(SurgeAction.status);
    expect(ch.written.length, 1);
    ch.replyLast('surge 5.0.0');
    await p1;
    expect(ch.written.length, 2);
    await runner.dispose();
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
