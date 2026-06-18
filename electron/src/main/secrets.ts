/**
 * Secret storage for SSH passphrases / passwords.
 *
 * Secrets are referenced from config by a `secretRef` string; the plaintext
 * never sits in our own config files. We persist them with Electron's
 * `safeStorage`, which encrypts via the OS-native facility (DPAPI on Windows,
 * Keychain on macOS, libsecret/kwallet on Linux) and write the ciphertext to a
 * small JSON file under userData. This is far more reliable than a native
 * keychain addon (keytar): no native build, and — crucially — it actually
 * persists across restarts on Windows, where the previous keytar path could
 * fail at the call site and silently fall back to a process-only store, leaving
 * the password "not found in keychain" after a relaunch.
 *
 * If encryption is unavailable (rare; e.g. a misconfigured Linux box), we store
 * the value obfuscated (base64) so the app keeps working, logging a warning.
 */
import { app, safeStorage } from "electron";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/** ref → tagged, encoded secret. Tag distinguishes encrypted vs. plain bytes. */
type Store = Record<string, string>;

let warned = false;

function file(): string {
  return join(app.getPath("userData"), "surge-manage", "secrets.json");
}

async function read(): Promise<Store> {
  try {
    return JSON.parse(await readFile(file(), "utf8")) as Store;
  } catch {
    return {};
  }
}

async function write(store: Store): Promise<void> {
  const path = file();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(store), "utf8");
}

function warnOnce(message: string): void {
  if (warned) return;
  console.warn(`[secrets] ${message}`);
  warned = true;
}

export async function setSecret(ref: string, value: string): Promise<void> {
  const store = await read();
  if (safeStorage.isEncryptionAvailable()) {
    store[ref] = `enc:${safeStorage.encryptString(value).toString("base64")}`;
  } else {
    warnOnce("OS encryption unavailable — storing secrets obfuscated, not encrypted");
    store[ref] = `raw:${Buffer.from(value, "utf8").toString("base64")}`;
  }
  await write(store);
}

export async function getSecret(ref: string): Promise<string | undefined> {
  const store = await read();
  const v = store[ref];
  if (!v) return undefined;
  if (v.startsWith("enc:")) {
    try {
      return safeStorage.decryptString(Buffer.from(v.slice(4), "base64"));
    } catch (err) {
      warnOnce(`failed to decrypt secret: ${err instanceof Error ? err.message : String(err)}`);
      return undefined;
    }
  }
  if (v.startsWith("raw:")) {
    return Buffer.from(v.slice(4), "base64").toString("utf8");
  }
  return v; // legacy/plain value
}

export async function deleteSecret(ref: string): Promise<void> {
  const store = await read();
  if (!(ref in store)) return;
  delete store[ref];
  await write(store);
}
