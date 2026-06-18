import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:dartssh2/dartssh2.dart';

import 'secure_store.dart';
import 'types.dart';

/// Result of a one-shot SSH command.
class ExecResult {
  const ExecResult({required this.stdout, required this.stderr, required this.code});
  final String stdout;
  final String stderr;
  final int code;
}

/// Opens an authenticated SSH connection (key / password) using dartssh2.
Future<SSHClient> connectSsh(HostConfig host) async {
  final socket = await SSHSocket.connect(
    host.host,
    host.port,
    timeout: const Duration(seconds: 20),
  );

  switch (host.auth) {
    case AuthMethod.key:
      final pem = await File(host.privateKeyPath ?? '').readAsString();
      final passphrase =
          host.secretRef != null ? await SecureStore.getSecret(host.secretRef!) : null;
      final keys = SSHKeyPair.fromPem(pem, passphrase);
      return SSHClient(socket, username: host.username, identities: keys);
    case AuthMethod.password:
      final pw =
          host.secretRef != null ? await SecureStore.getSecret(host.secretRef!) : null;
      if (pw == null) {
        throw StateError('Stored password not found for ${host.label}');
      }
      return SSHClient(socket, username: host.username, onPasswordRequest: () => pw);
    case AuthMethod.agent:
      throw UnsupportedError('SSH agent auth is not available on mobile');
  }
}

/// Read a remote file's contents as UTF-8 over SFTP.
Future<String> readRemoteFile(SSHClient client, String path) async {
  final sftp = await client.sftp();
  final file = await sftp.open(path);
  try {
    final bytes = await file.readBytes();
    return utf8.decode(bytes);
  } finally {
    await file.close();
  }
}

/// Write a remote file's contents as UTF-8 over SFTP (overwrites/truncates).
Future<void> writeRemoteFile(
  SSHClient client,
  String path,
  String content,
) async {
  final sftp = await client.sftp();
  final file = await sftp.open(
    path,
    mode: SftpFileOpenMode.create |
        SftpFileOpenMode.write |
        SftpFileOpenMode.truncate,
  );
  try {
    await file.writeBytes(Uint8List.fromList(utf8.encode(content)));
  } finally {
    await file.close();
  }
}

/// Run a command to completion and capture stdout/stderr/exit code.
Future<ExecResult> exec(SSHClient client, String command) async {
  final session = await client.execute(command);
  final stdout = StringBuffer();
  final stderr = StringBuffer();
  final outDone = session.stdout
      .cast<List<int>>()
      .transform(utf8.decoder)
      .forEach(stdout.write);
  final errDone = session.stderr
      .cast<List<int>>()
      .transform(utf8.decoder)
      .forEach(stderr.write);
  await Future.wait([outDone, errDone]);
  await session.done;
  return ExecResult(
    stdout: stdout.toString(),
    stderr: stderr.toString(),
    code: session.exitCode ?? 0,
  );
}
