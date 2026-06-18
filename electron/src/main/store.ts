import { app } from "electron";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { HostConfig } from "@surge-manage/shared";

/**
 * Persists host definitions as JSON under the app's userData dir. Secrets are
 * NOT stored here — only `secretRef` handles into the OS keychain.
 */
interface StoreShape {
  version: 1;
  hosts: HostConfig[];
  /** Pinned SSH host-key fingerprints (TOFU), keyed by `host:port`. */
  knownHosts: Record<string, string>;
}

const EMPTY: StoreShape = { version: 1, hosts: [], knownHosts: {} };

function file(): string {
  return join(app.getPath("userData"), "surge-manage", "hosts.json");
}

async function read(): Promise<StoreShape> {
  try {
    const raw = await readFile(file(), "utf8");
    const parsed = JSON.parse(raw) as StoreShape;
    return { ...EMPTY, ...parsed };
  } catch {
    return structuredClone(EMPTY);
  }
}

async function write(data: StoreShape): Promise<void> {
  const path = file();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2), "utf8");
}

export async function listHosts(): Promise<HostConfig[]> {
  return (await read()).hosts;
}

export async function saveHost(host: HostConfig): Promise<HostConfig> {
  const data = await read();
  const idx = data.hosts.findIndex((h) => h.id === host.id);
  if (idx >= 0) data.hosts[idx] = host;
  else data.hosts.push(host);
  await write(data);
  return host;
}

export async function removeHost(id: string): Promise<void> {
  const data = await read();
  data.hosts = data.hosts.filter((h) => h.id !== id);
  await write(data);
}

export async function getPinnedFingerprint(
  hostKey: string,
): Promise<string | undefined> {
  return (await read()).knownHosts[hostKey];
}

export async function pinFingerprint(
  hostKey: string,
  fingerprint: string,
): Promise<void> {
  const data = await read();
  data.knownHosts[hostKey] = fingerprint;
  await write(data);
}
