import 'dart:async';
import 'channel.dart';
import 'commands.dart';
import 'types.dart';

/// Serializes structured surge commands over a single terminal channel, framing
/// each with sentinel markers so output and exit codes can be captured
/// deterministically. Mirror of `packages/shared/src/runner.ts`.
class CommandRunner {
  CommandRunner(this._channel, this._profile) {
    _sub = _channel.output.listen(_ingest);
  }

  static const _begin = '__SM_BEGIN__';
  static const _end = '__SM_END__';

  final TerminalChannel _channel;
  final SurgeProfile _profile;
  late final StreamSubscription<String> _sub;

  final List<_QueuedCommand> _queue = [];
  _QueuedCommand? _active;
  String _buffer = '';
  int _seq = 0;
  Timer? _timer;

  Future<CommandResult> run(
    SurgeAction action, [
    List<String> args = const [],
    Duration timeout = const Duration(seconds: 15),
  ]) {
    final commandLine = buildCommandLine(_profile, action, args);
    final id = '${DateTime.now().millisecondsSinceEpoch.toRadixString(36)}_'
        '${(_seq++).toRadixString(36)}';
    final completer = Completer<CommandResult>();
    _queue.add(_QueuedCommand(
      id: id,
      action: action,
      commandLine: commandLine,
      completer: completer,
      timeout: timeout,
    ));
    _pump();
    return completer.future;
  }

  void _pump() {
    if (_active != null || _queue.isEmpty) return;
    final next = _queue.removeAt(0);
    _active = next;
    next.startedAt = DateTime.now();
    _buffer = '';
    final framed = "printf '\\n$_begin %s\\n' '${next.id}'; "
        '${next.commandLine}; '
        "__sm_rc=\$?; printf '\\n$_end %s %s\\n' '${next.id}' \"\$__sm_rc\"\n";
    _channel.write(framed);
    _timer = Timer(next.timeout, _onTimeout);
  }

  void _onTimeout() {
    final cmd = _active;
    if (cmd == null) return;
    _active = null;
    _timer = null;
    cmd.completer.completeError(
      TimeoutException('Command "${cmd.action.name}" timed out'),
    );
    _pump();
  }

  void _ingest(String chunk) {
    final cmd = _active;
    if (cmd == null) return;
    _buffer += chunk;
    if (_buffer.length > 8 * 1024 * 1024) {
      _buffer = _buffer.substring(_buffer.length - 4 * 1024 * 1024);
    }

    final endRe = RegExp('$_end ${cmd.id} (-?\\d+)');
    final endMatch = endRe.firstMatch(_buffer);
    if (endMatch == null) return;

    final beginMarker = '$_begin ${cmd.id}';
    final beginIdx = _buffer.indexOf(beginMarker);
    final captureStart =
        beginIdx == -1 ? 0 : _buffer.indexOf('\n', beginIdx) + 1;
    final captureEnd = _buffer.lastIndexOf('\n', endMatch.start);
    final stdout = _stripEcho(
      _buffer.substring(captureStart, captureEnd < 0 ? endMatch.start : captureEnd),
      cmd.commandLine,
    );
    final exitCode = int.tryParse(endMatch.group(1)!) ?? -1;

    _timer?.cancel();
    _timer = null;
    _active = null;
    cmd.completer.complete(CommandResult(
      action: cmd.action,
      exitCode: exitCode,
      stdout: stdout,
      durationMs: DateTime.now().difference(cmd.startedAt!).inMilliseconds,
    ));
    _pump();
  }

  String _stripEcho(String captured, String commandLine) {
    var out = captured;
    final echoIdx = out.indexOf(commandLine);
    if (echoIdx != -1) {
      final after = out.indexOf('\n', echoIdx);
      if (after != -1) out = out.substring(after + 1);
    }
    return out.replaceFirst(RegExp(r'^\r?\n'), '').replaceFirst(RegExp(r'\r?\n\s*$'), '');
  }

  Future<void> dispose() async {
    await _sub.cancel();
    _timer?.cancel();
    final err = StateError('Runner disposed');
    _active?.completer.completeError(err);
    for (final q in _queue) {
      q.completer.completeError(err);
    }
    _queue.clear();
    _active = null;
  }
}

class _QueuedCommand {
  _QueuedCommand({
    required this.id,
    required this.action,
    required this.commandLine,
    required this.completer,
    required this.timeout,
  });

  final String id;
  final SurgeAction action;
  final String commandLine;
  final Completer<CommandResult> completer;
  final Duration timeout;
  DateTime? startedAt;
}
