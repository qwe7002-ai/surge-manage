import { buildCommandLine } from "./commands.js";
import type { CommandResult, SurgeAction, SurgeProfile } from "./types.js";

/**
 * Minimal duplex view of a terminal session (mosh PTY or SSH shell). The runner
 * only needs to write bytes and subscribe to output; the concrete transport
 * (node-pty, ssh2 channel, Dart mosh client) implements this.
 */
export interface TerminalChannel {
  write(data: string): void;
  /** Subscribe to raw output. Returns an unsubscribe function. */
  onData(listener: (chunk: string) => void): () => void;
}

const BEGIN = "__SM_BEGIN__";
const END = "__SM_END__";

interface QueuedCommand {
  id: string;
  action: SurgeAction;
  commandLine: string;
  resolve: (r: CommandResult) => void;
  reject: (e: Error) => void;
  timeoutMs: number;
}

/**
 * Serializes structured surge commands over a single interactive terminal,
 * framing each with sentinel markers so output and exit codes can be captured
 * deterministically even though the channel is a raw byte stream.
 *
 * Commands are queued and run one at a time so markers never interleave.
 */
export class CommandRunner {
  private buffer = "";
  private queue: QueuedCommand[] = [];
  private active: QueuedCommand | null = null;
  private activeStart = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly unsubscribe: () => void;
  private seq = 0;
  private readonly channel: TerminalChannel;
  private readonly profile: SurgeProfile;

  constructor(channel: TerminalChannel, profile: SurgeProfile) {
    this.channel = channel;
    this.profile = profile;
    this.unsubscribe = channel.onData((chunk) => this.ingest(chunk));
  }

  dispose(): void {
    this.unsubscribe();
    if (this.timer) clearTimeout(this.timer);
    const err = new Error("Runner disposed");
    if (this.active) this.active.reject(err);
    for (const q of this.queue) q.reject(err);
    this.queue = [];
    this.active = null;
  }

  run(
    action: SurgeAction,
    args: string[] = [],
    timeoutMs = 15_000,
  ): Promise<CommandResult> {
    const commandLine = buildCommandLine(this.profile, action, args);
    const id = `${Date.now().toString(36)}_${(this.seq++).toString(36)}`;
    return new Promise<CommandResult>((resolve, reject) => {
      this.queue.push({ id, action, commandLine, resolve, reject, timeoutMs });
      this.pump();
    });
  }

  private pump(): void {
    if (this.active || this.queue.length === 0) return;
    const next = this.queue.shift()!;
    this.active = next;
    this.activeStart = Date.now();
    this.buffer = "";
    // Wrap so we can find begin/end markers and capture the real exit code.
    // The leading newline guards against a partial prompt on the same line.
    const framed =
      `printf '\\n${BEGIN} %s\\n' '${next.id}'; ` +
      `${next.commandLine}; ` +
      `__sm_rc=$?; printf '\\n${END} %s %s\\n' '${next.id}' "$__sm_rc"\n`;
    this.channel.write(framed);
    this.timer = setTimeout(() => this.onTimeout(), next.timeoutMs);
  }

  private onTimeout(): void {
    const cmd = this.active;
    if (!cmd) return;
    this.active = null;
    this.timer = null;
    cmd.reject(new Error(`Command "${cmd.action}" timed out`));
    this.pump();
  }

  private ingest(chunk: string): void {
    if (!this.active) return; // not awaiting a structured command
    this.buffer += chunk;
    // Cap buffer growth from a runaway/streaming command.
    if (this.buffer.length > 8 * 1024 * 1024) {
      this.buffer = this.buffer.slice(-4 * 1024 * 1024);
    }

    const cmd = this.active;
    const beginMarker = `${BEGIN} ${cmd.id}`;
    const endRe = new RegExp(`${END} ${cmd.id} (-?\\d+)`);
    const endMatch = endRe.exec(this.buffer);
    if (!endMatch) return;

    const beginIdx = this.buffer.indexOf(beginMarker);
    const captureStart =
      beginIdx === -1 ? 0 : this.buffer.indexOf("\n", beginIdx) + 1;
    const captureEnd = this.buffer.lastIndexOf("\n", endMatch.index);
    const stdout = stripEcho(
      this.buffer.slice(captureStart, captureEnd < 0 ? endMatch.index : captureEnd),
      cmd.commandLine,
    );
    const exitCode = Number(endMatch[1]);

    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.active = null;
    const result: CommandResult = {
      action: cmd.action,
      exitCode,
      stdout,
      durationMs: Date.now() - this.activeStart,
    };
    cmd.resolve(result);
    this.pump();
  }
}

/**
 * Remove the echoed command line(s) a PTY reflects before the real output, plus
 * trailing shell-prompt noise.
 */
function stripEcho(captured: string, commandLine: string): string {
  let out = captured;
  const echoIdx = out.indexOf(commandLine);
  if (echoIdx !== -1) {
    const after = out.indexOf("\n", echoIdx);
    if (after !== -1) out = out.slice(after + 1);
  }
  return out.replace(/^\r?\n/, "").replace(/\r?\n\s*$/, "");
}
