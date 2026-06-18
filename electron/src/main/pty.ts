import * as pty from "node-pty";
import type { TerminalChannel } from "@surge-manage/shared";
import type { MoshHandshake } from "./ssh";

/**
 * Wraps a spawned `mosh-client` process in a PTY and exposes it as a
 * {@link TerminalChannel} for the command runner plus raw I/O for the terminal
 * UI. mosh-client speaks the roaming UDP protocol to the mosh-server we
 * bootstrapped over SSH.
 */
export class MoshSession implements TerminalChannel {
  private readonly proc: pty.IPty;
  private readonly listeners = new Set<(chunk: string) => void>();
  private exitListener?: (code: number) => void;

  constructor(handshake: MoshHandshake, cols = 120, rows = 32) {
    // mosh-client reads the session key from MOSH_KEY and connects to
    // <host> <udp-port>. It must run inside a PTY for the remote shell to behave.
    this.proc = pty.spawn("mosh-client", [handshake.host, String(handshake.port)], {
      name: "xterm-256color",
      cols,
      rows,
      env: { ...process.env, MOSH_KEY: handshake.key, TERM: "xterm-256color" },
    });

    this.proc.onData((data) => {
      for (const l of this.listeners) l(data);
    });
    this.proc.onExit(({ exitCode }) => this.exitListener?.(exitCode));
  }

  write(data: string): void {
    this.proc.write(data);
  }

  onData(listener: (chunk: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onExit(cb: (code: number) => void): void {
    this.exitListener = cb;
  }

  resize(cols: number, rows: number): void {
    try {
      this.proc.resize(cols, rows);
    } catch {
      /* terminal already gone */
    }
  }

  dispose(): void {
    this.listeners.clear();
    try {
      this.proc.kill();
    } catch {
      /* already dead */
    }
  }
}
