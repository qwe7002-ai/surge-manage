import { readFile } from "node:fs/promises";
import { Client, type ConnectConfig } from "ssh2";
import type { HostConfig } from "@surge-manage/shared";
import { getSecret } from "./secrets";

export interface MoshHandshake {
  /** UDP port chosen by mosh-server. */
  port: number;
  /** Base64 session key passed to mosh-client via MOSH_KEY. */
  key: string;
  /** Resolved host address to point mosh-client at. */
  host: string;
}

const MOSH_CONNECT_RE = /MOSH CONNECT (\d+) (\S+)/;

/**
 * Open an SSH connection, run `mosh-server new`, and parse the handshake.
 *
 * mosh-server daemonizes and prints `MOSH CONNECT <port> <key>` then detaches;
 * we only need the SSH channel long enough to capture that line.
 */
export async function bootstrapMosh(host: HostConfig): Promise<MoshHandshake> {
  const conn = await connectSsh(host);
  try {
    const serverArgs =
      host.moshServerArgs ?? ["-s", "-c", "256", "-l", "LANG=en_US.UTF-8"];
    const cmd = `mosh-server new ${serverArgs.join(" ")}`;
    const output = await exec(conn, cmd);
    const match = MOSH_CONNECT_RE.exec(output);
    if (!match) {
      throw new Error(
        `mosh-server did not return a handshake. Output:\n${output.slice(0, 500)}`,
      );
    }
    return { port: Number(match[1]), key: match[2]!, host: host.host };
  } finally {
    conn.end();
  }
}

/** Run a one-shot command over SSH and resolve its combined stdout/stderr. */
export function exec(conn: Client, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) return reject(err);
      let out = "";
      stream
        .on("close", () => resolve(out))
        .on("data", (d: Buffer) => (out += d.toString("utf8")))
        .stderr.on("data", (d: Buffer) => (out += d.toString("utf8")));
    });
  });
}

export function connectSsh(host: HostConfig): Promise<Client> {
  return new Promise(async (resolve, reject) => {
    const conn = new Client();
    let cfg: ConnectConfig;
    try {
      cfg = await buildConnectConfig(host);
    } catch (e) {
      return reject(e);
    }
    conn
      .on("ready", () => resolve(conn))
      .on("error", (err) => reject(err))
      // TOFU host-key pinning is wired in connection.ts via hostVerifier.
      .connect(cfg);
  });
}

async function buildConnectConfig(host: HostConfig): Promise<ConnectConfig> {
  const base: ConnectConfig = {
    host: host.host,
    port: host.port,
    username: host.username,
    readyTimeout: 20_000,
    keepaliveInterval: 15_000,
  };

  switch (host.auth) {
    case "key": {
      if (!host.privateKeyPath) throw new Error("Key auth requires privateKeyPath");
      const privateKey = await readFile(host.privateKeyPath);
      const passphrase = host.secretRef ? await getSecret(host.secretRef) : undefined;
      return { ...base, privateKey, ...(passphrase ? { passphrase } : {}) };
    }
    case "password": {
      if (!host.secretRef) throw new Error("Password auth requires a stored secret");
      const password = await getSecret(host.secretRef);
      if (!password) throw new Error("Stored password not found in keychain");
      return { ...base, password };
    }
    case "agent": {
      const agent = process.env.SSH_AUTH_SOCK;
      if (!agent) throw new Error("SSH_AUTH_SOCK not set; agent auth unavailable");
      return { ...base, agent };
    }
  }
}
