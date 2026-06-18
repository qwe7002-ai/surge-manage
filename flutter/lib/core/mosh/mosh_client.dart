import 'dart:async';

import 'package:flutter/services.dart';

import '../channel.dart';
import '../ssh.dart';

/// Native mosh transport bridge.
///
/// mosh's State-Synchronization Protocol runs over UDP with AES-OCB encryption
/// and protobuf-framed diffs — too much to reimplement inline. The production
/// path is a platform channel to a bundled libmosh (`mosh-client`) on each OS:
///
///   • Android: NDK build of mosh-client invoked over a MethodChannel/EventChannel.
///   • iOS:     libmosh compiled into the app, same channel surface.
///   • Desktop (via Flutter desktop): spawn the system `mosh-client` binary.
///
/// This class defines that channel surface and exposes the session as a
/// [TerminalChannel] so the rest of the app is transport-agnostic. Until the
/// native side is wired up, [isAvailable] returns false and callers fall back to
/// [SshShellChannel]. Marked TODO(live) — requires on-device native code.
class NativeMoshClient {
  static const _method = MethodChannel('surge_manage/mosh');
  static const _events = EventChannel('surge_manage/mosh/output');

  /// Whether a native mosh client is present on this platform build.
  static Future<bool> isAvailable() async {
    try {
      return (await _method.invokeMethod<bool>('isAvailable')) ?? false;
    } on MissingPluginException {
      return false; // TODO(live): native plugin not yet bundled.
    } catch (_) {
      return false;
    }
  }

  /// Start a native mosh session against a bootstrapped handshake and return a
  /// [TerminalChannel] backed by the platform UDP client.
  static Future<TerminalChannel> connect(MoshHandshake handshake) async {
    await _method.invokeMethod<void>('connect', {
      'host': handshake.host,
      'port': handshake.port,
      'key': handshake.key,
    });
    return _NativeMoshChannel();
  }
}

class _NativeMoshChannel implements TerminalChannel {
  _NativeMoshChannel() {
    _sub = NativeMoshClient._events
        .receiveBroadcastStream()
        .map((e) => e as String)
        .listen(_controller.add);
  }

  final _controller = StreamController<String>.broadcast();
  late final StreamSubscription _sub;

  @override
  Stream<String> get output => _controller.stream;

  @override
  void write(String data) =>
      NativeMoshClient._method.invokeMethod<void>('write', {'data': data});

  @override
  Future<void> resize(int cols, int rows) async => NativeMoshClient._method
      .invokeMethod<void>('resize', {'cols': cols, 'rows': rows});

  @override
  Future<void> close() async {
    await _sub.cancel();
    await NativeMoshClient._method.invokeMethod<void>('close');
    await _controller.close();
  }
}
