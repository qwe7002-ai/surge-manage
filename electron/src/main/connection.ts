import { EventEmitter } from "node:events";
import {
  buildCommandLine,
  CommandRunner,
  parseLogLine,
  type CommandResult,
  type ConnectionState,
  type HostConfig,
  type LogLine,
  type SurgeAction,
} from "@surge-manage/shared";
import { bootstrapMosh } from "./ssh";
import { MoshSession } from "./pty";

/**
 * Owns the lifecycle of a single active connection: SSH→mosh bootstrap, the
 * mosh PTY session, and the structured command runner layered on top.
 *
 * The mosh PTY is an INTERNAL transport — its raw bytes are never forwarded to
 * the renderer. The UI only ever receives structured results (via `run`) and
 * parsed log lines (via the "log" event).
 *
 * Emits:
 *   - "state"  (ConnectionState)
 *   - "log"    (LogLine)  parsed lines from a streaming `surge log --follow`
 */
export class ConnectionManager extends EventEmitter {
  private session: MoshSession | null = null;
  private runner: CommandRunner | null = null;
  private current: HostConfig | null = null;
  private state: ConnectionState = { phase: "disconnected", since: Date.now() };
  private logStreaming = false;
  private logUnsub: (() => void) | null = null;
  private logBuffer = "";

  getState(): ConnectionState {
    return this.state;
  }

  private setState(patch: Partial<ConnectionState>): void {
    this.state = { ...this.state, ...patch, since: Date.now() };
    this.emit("state", this.state);
  }

  async connect(host: HostConfig): Promise<void> {
    if (this.session) await this.disconnect();
    this.current = host;
    this.setState({ phase: "sshConnecting", hostId: host.id, error: undefined });

    try {
      this.setState({ phase: "moshBootstrapping" });
      const handshake = await bootstrapMosh(host);

      const session = new MoshSession(handshake);
      session.onExit((code) => {
        if (this.state.phase === "connected") {
          this.setState({
            phase: "error",
            error: `mosh-client exited (code ${code})`,
          });
        }
        this.cleanup();
      });

      this.session = session;
      this.runner = new CommandRunner(session, host.surge);

      // Give the remote shell a beat to print its prompt, then mark connected.
      await delay(400);
      this.setState({ phase: "connected" });
    } catch (err) {
      this.setState({ phase: "error", error: errMessage(err) });
      this.cleanup();
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    this.cleanup();
    this.setState({ phase: "disconnected", hostId: undefined, error: undefined });
  }

  /** Run a structured surge action via the sentinel-framed runner. */
  async run(action: SurgeAction, args: string[] = []): Promise<CommandResult> {
    if (!this.runner) throw new Error("Not connected");
    if (this.logStreaming) {
      throw new Error("Stop the log stream before running other actions");
    }
    return this.runner.run(action, args);
  }

  /**
   * Stream `surge log --follow` from the PTY, parsing each line into a LogLine
   * and emitting it. The follow command occupies the channel, so structured
   * commands are blocked until {@link stopLogs} is called. The renderer drives
   * this from the Logs tab lifecycle — the user never sees raw shell output.
   */
  startLogs(): void {
    if (!this.session || !this.current || this.logStreaming) return;
    this.logStreaming = true;
    this.logBuffer = "";
    this.logUnsub = this.session.onData((chunk) => this.onLogChunk(chunk));
    const cmd = buildCommandLine(this.current.surge, "logsTail");
    this.session.write(`${cmd}\n`);
  }

  stopLogs(): void {
    if (!this.logStreaming || !this.session) return;
    this.logStreaming = false;
    this.logUnsub?.();
    this.logUnsub = null;
    // Ctrl-C to interrupt `--follow`, then a newline to restore the prompt.
    this.session.write("\x03\n");
    this.logBuffer = "";
  }

  private onLogChunk(chunk: string): void {
    this.logBuffer += chunk;
    const lines = this.logBuffer.split(/\r?\n/);
    this.logBuffer = lines.pop() ?? "";
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      const parsed: LogLine = parseLogLine(line);
      this.emit("log", parsed);
    }
  }

  private cleanup(): void {
    this.stopLogs();
    this.runner?.dispose();
    this.runner = null;
    this.session?.dispose();
    this.session = null;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
