import { readFile } from "node:fs/promises";
import { Client, type ClientChannel, type ConnectConfig } from "ssh2";
import type { HostConfig } from "@surge-manage/shared";
import { getSecret } from "./secrets";

/** Result of a one-shot SSH command. */
export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

/** Open an authenticated SSH connection (key / password / agent). */
export function connectSsh(host: HostConfig): Promise<Client> {
  return new Promise((resolve, reject) => {
    void (async () => {
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
        .connect(cfg);
    })();
  });
}

/** Run a command to completion and capture stdout/stderr/exit code. */
export function exec(conn: Client, command: string): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) return reject(err);
      let stdout = "";
      let stderr = "";
      stream
        .on("close", (code: number) => resolve({ stdout, stderr, code: code ?? 0 }))
        .on("data", (d: Buffer) => (stdout += d.toString("utf8")))
        .stderr.on("data", (d: Buffer) => (stderr += d.toString("utf8")));
    });
  });
}

/**
 * Start a long-running command and stream stdout line-by-line (used for
 * `surge log --follow`). Returns the channel so the caller can close it to stop.
 */
export function execStream(
  conn: Client,
  command: string,
  onLine: (line: string) => void,
): Promise<ClientChannel> {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) return reject(err);
      let buffer = "";
      const flush = (chunk: Buffer) => {
        buffer += chunk.toString("utf8");
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) onLine(trimmed);
        }
      };
      stream.on("data", flush);
      stream.stderr.on("data", flush);
      resolve(stream);
    });
  });
}

/** Read a remote file's contents as UTF-8 over SFTP. */
export function readRemoteFile(conn: Client, path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      sftp.readFile(path, (readErr, buf) => {
        if (readErr) return reject(readErr);
        resolve(buf.toString("utf8"));
      });
    });
  });
}

/** Write a remote file's contents as UTF-8 over SFTP (overwrites). */
export function writeRemoteFile(
  conn: Client,
  path: string,
  content: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      sftp.writeFile(path, Buffer.from(content, "utf8"), (writeErr) => {
        if (writeErr) return reject(writeErr);
        resolve();
      });
    });
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
    case "local":
      throw new Error("Local debug hosts do not use SSH");
  }
}
