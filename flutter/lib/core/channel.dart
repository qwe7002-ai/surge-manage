/// Minimal duplex view of a terminal session (mosh or SSH shell). The runner
/// only needs to write bytes and subscribe to output; concrete transports
/// implement this. Mirror of `TerminalChannel` in the shared TS package.
abstract class TerminalChannel {
  void write(String data);

  /// Broadcast stream of raw output from the remote.
  Stream<String> get output;

  Future<void> resize(int cols, int rows);

  Future<void> close();
}
