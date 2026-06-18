import type {
  CommandResult,
  ConnectionState,
  HostConfig,
  LogLine,
  SurgeAction,
} from "./types.js";

/**
 * Single source of truth for the Electron main↔renderer IPC contract. Channel
 * names live here so both sides can't drift, and the `SurgeBridge` interface is
 * exactly what `contextBridge` exposes on `window.surge`.
 *
 * NOTE: there is deliberately NO raw-terminal channel. The renderer never gets
 * shell access — the SSH connection is an internal transport in the main process.
 * The UI only issues structured surge actions and receives parsed results/log lines.
 */
export const IPC = {
  hostsList: "hosts:list",
  hostsSave: "hosts:save",
  hostsRemove: "hosts:remove",
  hostsSetSecret: "hosts:setSecret",
  connConnect: "conn:connect",
  connDisconnect: "conn:disconnect",
  connState: "conn:state", // main → renderer event
  surgeRun: "surge:run",
  profilesList: "profiles:list",
  profileRead: "profile:read",
  profileWrite: "profile:write",
  logsStart: "logs:start",
  logsStop: "logs:stop",
  logLine: "log:line", // main → renderer event (parsed streaming surge logs)
} as const;

export interface SurgeBridge {
  hosts: {
    list(): Promise<HostConfig[]>;
    save(host: HostConfig): Promise<HostConfig>;
    remove(id: string): Promise<void>;
    /** Store a secret (password/passphrase) in the OS keychain under `ref`. */
    setSecret(ref: string, value: string): Promise<void>;
  };
  connection: {
    connect(hostId: string): Promise<void>;
    disconnect(): Promise<void>;
    onState(cb: (state: ConnectionState) => void): () => void;
  };
  surge: {
    run(action: SurgeAction, args?: string[]): Promise<CommandResult>;
  };
  profiles: {
    /** List `*.conf` profile names in the host's configured config directory. */
    list(): Promise<string[]>;
    /** Read a profile config file (absolute remote path) over SFTP. */
    read(path: string): Promise<string>;
    /** Overwrite a profile config file (absolute remote path) over SFTP. */
    write(path: string, content: string): Promise<void>;
  };
  logs: {
    /** Begin streaming parsed surge log lines (e.g. when the Logs tab opens). */
    start(): Promise<void>;
    /** Stop the active log stream. */
    stop(): Promise<void>;
    onLine(cb: (line: LogLine) => void): () => void;
  };
}

declare global {
  interface Window {
    surge: SurgeBridge;
  }
}
