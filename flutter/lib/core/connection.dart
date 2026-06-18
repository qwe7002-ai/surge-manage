import 'dart:async';

import 'package:dartssh2/dartssh2.dart';

import 'channel.dart';
import 'commands.dart';
import 'mosh/mosh_client.dart';
import 'parsers.dart';
import 'runner.dart';
import 'ssh.dart';
import 'types.dart';

/// Owns one active connection: SSH→mosh bootstrap, the transport channel, and
/// the structured command runner. The transport's raw bytes are NEVER surfaced
/// to the UI — only structured results (via [run]) and parsed log lines (via
/// [logs]). Mirror of the Electron `ConnectionManager`.
class ConnectionManager {
  ConnectionManager(this._host);

  final HostConfig _host;

  SSHClient? _client;
  TerminalChannel? _channel;
  CommandRunner? _runner;
  StreamSubscription<String>? _logSub;
  bool _logStreaming = false;
  String _logBuffer = '';

  final _state = StreamController<ConnectionState>.broadcast();
  final _logController = StreamController<LogLine>.broadcast();

  Stream<ConnectionState> get state => _state.stream;
  Stream<LogLine> get logs => _logController.stream;

  void _emit(ConnectionPhase phase, {String? error}) {
    _state.add(ConnectionState(phase: phase, hostId: _host.id, error: error));
  }

  Future<void> connect() async {
    _emit(ConnectionPhase.sshConnecting);
    try {
      final client = await connectSsh(_host);
      _client = client;

      _emit(ConnectionPhase.moshBootstrapping);
      final handshake = await bootstrapMosh(_host, client);

      // Prefer a native mosh transport; fall back to an SSH shell otherwise.
      _channel = await NativeMoshClient.isAvailable()
          ? await NativeMoshClient.connect(handshake)
          : await SshShellChannel.open(client);

      _runner = CommandRunner(_channel!, _host.surge);
      await Future<void>.delayed(const Duration(milliseconds: 400));
      _emit(ConnectionPhase.connected);
    } catch (e) {
      _emit(ConnectionPhase.error, error: e.toString());
      await _cleanup();
      rethrow;
    }
  }

  Future<CommandResult> run(SurgeAction action, [List<String> args = const []]) {
    final runner = _runner;
    if (runner == null) throw StateError('Not connected');
    if (_logStreaming) {
      throw StateError('Stop the log stream before running other actions');
    }
    return runner.run(action, args);
  }

  void startLogs() {
    final channel = _channel;
    if (channel == null || _logStreaming) return;
    _logStreaming = true;
    _logBuffer = '';
    _logSub = channel.output.listen(_onLogChunk);
    channel.write('${buildCommandLine(_host.surge, SurgeAction.logsTail)}\n');
  }

  void stopLogs() {
    final channel = _channel;
    if (!_logStreaming || channel == null) return;
    _logStreaming = false;
    _logSub?.cancel();
    _logSub = null;
    channel.write('\x03\n'); // Ctrl-C to interrupt --follow
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
    await _runner?.dispose();
    _runner = null;
    await _channel?.close();
    _channel = null;
    _client?.close();
    _client = null;
  }

  Future<void> dispose() async {
    await _cleanup();
    await _state.close();
    await _logController.close();
  }
}
