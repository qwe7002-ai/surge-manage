import 'dart:async';
import 'dart:convert';

import 'package:dartssh2/dartssh2.dart';

import 'commands.dart';
import 'parsers.dart';
import 'ssh.dart';
import 'types.dart';

/// Owns one SSH connection and runs structured `surge` commands over it via
/// `exec` (clean stdout + exit code per command). The SSH stream is internal —
/// the UI only sees structured results (via [run]) and parsed log lines (via
/// [logs]). No raw shell is exposed. Mirror of the Electron `ConnectionManager`.
class ConnectionManager {
  ConnectionManager(this._host);

  final HostConfig _host;

  SSHClient? _client;
  SSHSession? _logSession;
  String _logBuffer = '';

  final _state = StreamController<ConnectionState>.broadcast();
  final _logController = StreamController<LogLine>.broadcast();

  Stream<ConnectionState> get state => _state.stream;
  Stream<LogLine> get logs => _logController.stream;

  void _emit(ConnectionPhase phase, {String? error}) {
    _state.add(ConnectionState(phase: phase, hostId: _host.id, error: error));
  }

  Future<void> connect() async {
    _emit(ConnectionPhase.connecting);
    try {
      _client = await connectSsh(_host);
      _client!.done.then((_) {
        _emit(ConnectionPhase.disconnected);
      });
      _emit(ConnectionPhase.connected);
    } catch (e) {
      _emit(ConnectionPhase.error, error: e.toString());
      await _cleanup();
      rethrow;
    }
  }

  Future<CommandResult> run(SurgeAction action, [List<String> args = const []]) async {
    final client = _client;
    if (client == null) throw StateError('Not connected');
    final commandLine = buildCommandLine(_host.surge, action, args);
    final started = DateTime.now();
    final res = await exec(client, commandLine);
    return CommandResult(
      action: action,
      exitCode: res.code,
      stdout: res.stdout.isNotEmpty ? res.stdout : res.stderr,
      durationMs: DateTime.now().difference(started).inMilliseconds,
    );
  }

  Future<void> startLogs() async {
    final client = _client;
    if (client == null || _logSession != null) return;
    _logBuffer = '';
    final cmd = buildCommandLine(_host.surge, SurgeAction.logsTail);
    final session = await client.execute(cmd);
    _logSession = session;
    session.stdout.cast<List<int>>().transform(utf8.decoder).listen(_onLogChunk);
    session.stderr.cast<List<int>>().transform(utf8.decoder).listen(_onLogChunk);
  }

  void stopLogs() {
    final session = _logSession;
    if (session == null) return;
    _logSession = null;
    session.kill(SSHSignal.INT);
    session.close();
    _logBuffer = '';
  }

  void _onLogChunk(String chunk) {
    _logBuffer += chunk;
    final lines = _logBuffer.split(RegExp(r'\r?\n'));
    _logBuffer = lines.removeLast();
    for (final raw in lines) {
      final line = raw.trim();
      if (line.isEmpty) continue;
      _logController.add(parseLogLine(line));
    }
  }

  Future<void> disconnect() async {
    await _cleanup();
    _emit(ConnectionPhase.disconnected);
  }

  Future<void> _cleanup() async {
    stopLogs();
    _client?.close();
    _client = null;
  }

  Future<void> dispose() async {
    await _cleanup();
    await _state.close();
    await _logController.close();
  }
}
