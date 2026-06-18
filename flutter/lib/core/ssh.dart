import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:dartssh2/dartssh2.dart';

import 'channel.dart';
import 'secure_store.dart';
import 'types.dart';

/// Result of the SSH→mosh bootstrap: the UDP port and one-time key printed by
/// `mosh-server new`.
class MoshHandshake {
  const MoshHandshake({required this.host, required this.port, required this.key});
  final String host;
  final int port;
  final String key;
}

final RegExp _moshConnect = RegExp(r'MOSH CONNECT (\d+) (\S+)');

/// Opens an SSH connection (key/password) using dartssh2.
Future<SSHClient> connectSsh(HostConfig host) async {
  final socket = await SSHSocket.connect(host.host, host.port,
      timeout: const Duration(seconds: 20));

  switch (host.auth) {
    case AuthMethod.key:
      final pem = await File(host.privateKeyPath ?? '').readAsString();
      final passphrase =
          host.secretRef != null ? await SecureStore.getSecret(host.secretRef!) : null;
      final keys = SSHKeyPair.fromPem(pem, passphrase);
      return SSHClient(socket, username: host.username, identities: keys);
    case AuthMethod.password:
      final pw = host.secretRef != null
          ? await SecureStore.getSecret(host.secretRef!)
          : null;
      if (pw == null) {
        throw StateError('Stored password not found for ${host.label}');
      }
      return SSHClient(socket, username: host.username, onPasswordRequest: () => pw);
    case AuthMethod.agent:
      throw UnsupportedError('SSH agent auth is not available on mobile');
  }
}

/// Runs `mosh-server new` over SSH and parses the handshake line.
Future<MoshHandshake> bootstrapMosh(HostConfig host, SSHClient client) async {
  final serverArgs =
      host.moshServerArgs ?? const ['-s', '-c', '256', '-l', 'LANG=en_US.UTF-8'];
  final cmd = 'mosh-server new ${serverArgs.join(' ')}';
  final bytes = await client.run(cmd);
  final output = utf8.decode(bytes, allowMalformed: true);
  final match = _moshConnect.firstMatch(output);
  if (match == null) {
    throw StateError(
      'mosh-server did not return a handshake:\n${output.substring(0, output.length.clamp(0, 500))}',
    );
  }
  return MoshHandshake(
    host: host.host,
    port: int.parse(match.group(1)!),
    key: match.group(2)!,
  );
}

/// Fallback transport: an interactive SSH shell exposed as a [TerminalChannel].
///
/// Used on platforms where no native mosh client is wired up yet (see
/// `mosh/mosh_client.dart`). The structured-command runner behaves identically
/// over either transport; only the roaming/resilience characteristics differ.
class SshShellChannel implements TerminalChannel {
  SshShellChannel._(this._session, this._client);

  final SSHSession _session;
  final SSHClient _client;
  final _controller = StreamController<String>.broadcast();
  StreamSubscription<List<int>>? _stdoutSub;
  StreamSubscription<List<int>>? _stderrSub;

  static Future<SshShellChannel> open(SSHClient client) async {
    final session = await client.shell(
      pty: const SSHPtyConfig(width: 120, height: 32, type: 'xterm-256color'),
    );
    final ch = SshShellChannel._(session, client);
    ch._stdoutSub = session.stdout
        .listen((d) => ch._controller.add(utf8.decode(d, allowMalformed: true)));
    ch._stderrSub = session.stderr
        .listen((d) => ch._controller.add(utf8.decode(d, allowMalformed: true)));
    return ch;
  }

  @override
  Stream<String> get output => _controller.stream;

  @override
  void write(String data) => _session.write(utf8.encode(data));

  @override
  Future<void> resize(int cols, int rows) async =>
      _session.resizeTerminal(cols, rows);

  @override
  Future<void> close() async {
    await _stdoutSub?.cancel();
    await _stderrSub?.cancel();
    _session.close();
    _client.close();
    await _controller.close();
  }
}
