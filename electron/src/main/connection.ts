import { EventEmitter } from "node:events";
import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { copyFile, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import type { Client, ClientChannel } from "ssh2";
import {
  buildCommandArgv,
  buildCommandLine,
  buildListProfilesCommand,
  DEFAULT_CONFIG_DIR,
  parseLogLine,
  parseProfiles,
  shellQuote,
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
  private logChannel: ClientChannel | ChildProcessWithoutNullStreams | null = null;
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
      if (host.auth === "local") {
        this.client = null;
        this.setState({ phase: "connected" });
        return;
      }
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
    if (!this.current || (this.current.auth !== "local" && !this.client)) {
      throw new Error("Not connected");
    }
    const commandLine = buildCommandLine(this.current.surge, action, args);
    const started = Date.now();
    const { stdout, stderr, code } =
      this.current.auth === "local"
        ? await execLocal(this.current.surge, action, args)
        : await exec(this.client!, commandLine);
    return {
      action,
      exitCode: code,
      // surge sometimes writes useful output to stderr; include it when stdout is empty.
      stdout: stdout || stderr,
      durationMs: Date.now() - started,
    };
  }

  /** Read a profile config file from the remote host over SFTP. */
  async readProfile(profile: string): Promise<string> {
    if (!this.current || (this.current.auth !== "local" && !this.client)) {
      throw new Error("Not connected");
    }
    const path = await this.profilePath(profile);
    if (this.current.auth === "local") return readFile(path, "utf8");
    return readRemoteFile(this.client!, path);
  }

  /** Write a profile config file to the remote host over SFTP. */
  async writeProfile(profile: string, content: string): Promise<void> {
    if (!this.current || (this.current.auth !== "local" && !this.client)) {
      throw new Error("Not connected");
    }
    const path = await this.profilePath(profile);
    const tmp = `${path}.surge-manage-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.tmp`;
    const backup = `${path}.bak`;

    if (this.current.auth === "local") {
      try {
        await writeFile(tmp, content, "utf8");
        const check = await execLocal(this.current.surge, "checkProfile", [tmp]);
        if (check.code !== 0) {
          throw new Error((check.stdout || check.stderr || "Profile check failed").trim());
        }
        await copyFile(path, backup);
        await rename(tmp, path);
      } catch (err) {
        await unlink(tmp).catch(() => undefined);
        throw err;
      }
      return;
    }

    try {
      await writeRemoteFile(this.client!, tmp, content);
      const check = await exec(
        this.client!,
        buildCommandLine(this.current.surge, "checkProfile", [tmp]),
      );
      if (check.code !== 0) {
        throw new Error((check.stdout || check.stderr || "Profile check failed").trim());
      }
      const swap = `cp -p -- ${shellQuote(path)} ${shellQuote(backup)} && mv -f -- ${shellQuote(tmp)} ${shellQuote(path)}`;
      const moved = await exec(this.client!, swap);
      if (moved.code !== 0) {
        throw new Error((moved.stderr || moved.stdout || "Profile write failed").trim());
      }
    } catch (err) {
      await exec(this.client!, `rm -f -- ${shellQuote(tmp)}`).catch(() => undefined);
      throw err;
    }
  }

  /**
   * Expand a leading `~` to the remote home directory. SFTP (unlike a shell)
   * does not expand `~`, and config dirs are often `~/Library/.../Profiles`.
   */
  private async resolvePath(path: string): Promise<string> {
    if (path !== "~" && !path.startsWith("~/")) return path;
    if (this.current?.auth === "local") return homedir() + path.slice(1);
    if (this.homeDir === null) {
      const { stdout } = await exec(this.client!, 'printf %s "$HOME"');
      this.homeDir = stdout.trim();
    }
    return this.homeDir + path.slice(1);
  }

  /** List `*.conf` profiles in the host's configured config directory. */
  async listProfiles(): Promise<string[]> {
    if (!this.current || (this.current.auth !== "local" && !this.client)) {
      throw new Error("Not connected");
    }
    const dir = await this.profileDir();
    if (this.current.auth === "local") {
      const names = await readdir(dir);
      return names
        .filter((name) => name.endsWith(".conf"))
        .map((name) => name.slice(0, -".conf".length))
        .sort((a, b) => a.localeCompare(b));
    }
    const { stdout } = await exec(this.client!, buildListProfilesCommand(dir));
    return parseProfiles(stdout);
  }

  private async profilePath(profile: string): Promise<string> {
    const name = validateProfileName(profile);
    const profiles = await this.listProfiles();
    if (!profiles.includes(name)) throw new Error(`Unknown profile: ${name}`);
    return `${await this.profileDir()}/${name}.conf`;
  }

  private async profileDir(): Promise<string> {
    if (!this.current) throw new Error("Not connected");
    const dir = this.current.configDir?.trim() || DEFAULT_CONFIG_DIR;
    return (await this.resolvePath(dir)).replace(/\/+$/, "");
  }

  /** Stream `surge watch request`, emitting parsed LogLine events. */
  async startLogs(): Promise<void> {
    if (!this.current || this.logChannel) return;
    if (this.current.auth === "local") {
      const command = buildCommandArgv(this.current.surge, "watchRequest");
      const bin = command[0]!;
      const args = command.slice(1);
      const child = spawn(bin, args);
      this.logChannel = child;
      child.stdout.on("data", (chunk: Buffer) => emitLines(chunk, (line) => {
        this.emit("log", parseLogLine(line));
      }));
      child.stderr.on("data", (chunk: Buffer) => emitLines(chunk, (line) => {
        this.emit("log", parseLogLine(line));
      }));
      child.on("close", () => {
        if (this.logChannel === child) this.logChannel = null;
      });
      return;
    }
    if (!this.client) return;
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
    if ("kill" in this.logChannel) {
      this.logChannel.kill("SIGINT");
      this.logChannel = null;
      return;
    }
    // Closing the channel sends EOF/kills the remote watch command.
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

function validateProfileName(profile: string): string {
  const name = profile.trim();
  if (
    !name ||
    name === "." ||
    name === ".." ||
    name.endsWith(".conf") ||
    /[/\\\0]/.test(name)
  ) {
    throw new Error(`Invalid profile name: ${profile}`);
  }
  return name;
}

function execLocal(
  profile: HostConfig["surge"],
  action: SurgeAction,
  args: string[] = [],
): Promise<{ stdout: string; stderr: string; code: number }> {
  const command = buildCommandArgv(profile, action, args);
  const bin = command[0]!;
  const argv = command.slice(1);
  return new Promise((resolve, reject) => {
    execFile(bin, argv, { encoding: "utf8" }, (err, stdout, stderr) => {
      const code = typeof err?.code === "number" ? err.code : err ? 1 : 0;
      resolve({ stdout, stderr, code });
    }).on("error", reject);
  });
}

function emitLines(chunk: Buffer, onLine: (line: string) => void): void {
  for (const raw of chunk.toString("utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (line) onLine(line);
  }
}
