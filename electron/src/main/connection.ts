import { EventEmitter } from "node:events";
import type { Client, ClientChannel } from "ssh2";
import {
  buildCommandLine,
  buildListProfilesCommand,
  DEFAULT_CONFIG_DIR,
  parseLogLine,
  parseProfiles,
  type CommandResult,
  type ConnectionState,
  type HostConfig,
  type SurgeAction,
} from "@surge-manage/shared";
import {
  connectSsh,
  exec,
  execStream,
  readRemoteFile,
  writeRemoteFile,
} from "./ssh";

/**
 * Owns the lifecycle of a single SSH connection and runs structured `surge`
 * commands over it via `exec` (clean stdout + exit code per command — no PTY,
 * no framing). The SSH stream is internal; the UI only receives structured
 * results (via `run`) and parsed log lines (via the "log" event). No raw shell
 * is ever exposed.
 *
 * Emits:
 *   - "state"  (ConnectionState)
 *   - "log"    (LogLine)  parsed lines from a streaming `surge log --follow`
 */
export class ConnectionManager extends EventEmitter {
  private client: Client | null = null;
  private current: HostConfig | null = null;
  private logChannel: ClientChannel | null = null;
  private state: ConnectionState = { phase: "disconnected", since: Date.now() };
  /** Cached remote $HOME for expanding `~` in profile paths. */
  private homeDir: string | null = null;

  getState(): ConnectionState {
    return this.state;
  }

  private setState(patch: Partial<ConnectionState>): void {
    this.state = { ...this.state, ...patch, since: Date.now() };
    this.emit("state", this.state);
  }

  async connect(host: HostConfig): Promise<void> {
    if (this.client) await this.disconnect();
    this.current = host;
    this.homeDir = null; // re-resolve per host
    this.setState({ phase: "connecting", hostId: host.id, error: undefined });

    try {
      const client = await connectSsh(host);
      client.on("close", () => {
        if (this.state.phase === "connected") {
          this.setState({ phase: "error", error: "SSH connection closed" });
        }
        this.cleanup();
      });
      client.on("error", (err) => {
        if (this.state.phase === "connected") {
          this.setState({ phase: "error", error: err.message });
        }
      });
      this.client = client;
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

  /** Run a structured surge action over SSH exec. */
  async run(action: SurgeAction, args: string[] = []): Promise<CommandResult> {
    if (!this.client || !this.current) throw new Error("Not connected");
    const commandLine = buildCommandLine(this.current.surge, action, args);
    const started = Date.now();
    const { stdout, stderr, code } = await exec(this.client, commandLine);
    return {
      action,
      exitCode: code,
      // surge sometimes writes useful output to stderr; include it when stdout is empty.
      stdout: stdout || stderr,
      durationMs: Date.now() - started,
    };
  }

  /** Read a profile config file from the remote host over SFTP. */
  async readProfile(path: string): Promise<string> {
    if (!this.client) throw new Error("Not connected");
    return readRemoteFile(this.client, await this.resolvePath(path));
  }

  /** Write a profile config file to the remote host over SFTP. */
  async writeProfile(path: string, content: string): Promise<void> {
    if (!this.client) throw new Error("Not connected");
    await writeRemoteFile(this.client, await this.resolvePath(path), content);
  }

  /**
   * Expand a leading `~` to the remote home directory. SFTP (unlike a shell)
   * does not expand `~`, and config dirs are often `~/Library/.../Profiles`.
   */
  private async resolvePath(path: string): Promise<string> {
    if (path !== "~" && !path.startsWith("~/")) return path;
    if (this.homeDir === null) {
      const { stdout } = await exec(this.client!, 'printf %s "$HOME"');
      this.homeDir = stdout.trim();
    }
    return this.homeDir + path.slice(1);
  }

  /** List `*.conf` profiles in the host's configured config directory. */
  async listProfiles(): Promise<string[]> {
    if (!this.client || !this.current) throw new Error("Not connected");
    const dir = this.current.configDir?.trim() || DEFAULT_CONFIG_DIR;
    const { stdout } = await exec(this.client, buildListProfilesCommand(dir));
    return parseProfiles(stdout);
  }

  /** Stream `surge watch request`, emitting parsed LogLine events. */
  async startLogs(): Promise<void> {
    if (!this.client || !this.current || this.logChannel) return;
    const cmd = buildCommandLine(this.current.surge, "watchRequest");
    this.logChannel = await execStream(this.client, cmd, (line) => {
      this.emit("log", parseLogLine(line));
    });
    this.logChannel.on("close", () => {
      this.logChannel = null;
    });
  }

  stopLogs(): void {
    if (!this.logChannel) return;
    // Closing the channel sends EOF/kills the remote `--follow`.
    try {
      this.logChannel.close();
      this.logChannel.signal("INT");
    } catch {
      /* channel already gone */
    }
    this.logChannel = null;
  }

  private cleanup(): void {
    this.stopLogs();
    if (this.client) {
      try {
        this.client.end();
      } catch {
        /* already closed */
      }
    }
    this.client = null;
  }
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
