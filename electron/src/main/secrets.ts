/**
 * Thin wrapper over the OS keychain (keytar). Secrets (SSH passphrases,
 * passwords) are referenced from config by a `secretRef` string; the plaintext
 * never touches disk in our own files.
 *
 * keytar is a native module; if it fails to load (e.g. missing libsecret on a
 * headless Linux box) we fall back to an in-memory store so the app still runs,
 * logging a warning. Production builds should ship libsecret.
 *
 * Loading is not the only failure mode: on Windows the native binding can load
 * yet still throw at the Credential Manager call (ABI mismatches with the
 * bundled Electron, partial native loads, transient vault errors). If those
 * runtime errors escaped this module they would reject the renderer's save IPC
 * — and because the Save handler swallows rejections, the button would appear
 * dead. So every operation degrades to the in-memory store instead of throwing.
 */
const SERVICE = "surge-manage";

type Keytar = typeof import("keytar");
let keytar: Keytar | null = null;
let warned = false;
const memory = new Map<string, string>();

async function load(): Promise<Keytar | null> {
  if (keytar) return keytar;
  try {
    keytar = await import("keytar");
    return keytar;
  } catch {
    warnOnce("keytar unavailable — falling back to in-memory secret store");
    return null;
  }
}

function warnOnce(message: string): void {
  if (warned) return;
  console.warn(`[secrets] ${message}`);
  warned = true;
}

export async function setSecret(ref: string, value: string): Promise<void> {
  const kt = await load();
  if (kt) {
    try {
      await kt.setPassword(SERVICE, ref, value);
      return;
    } catch (err) {
      warnOnce(`keychain write failed — using in-memory secret store: ${errText(err)}`);
    }
  }
  memory.set(ref, value);
}

export async function getSecret(ref: string): Promise<string | undefined> {
  const kt = await load();
  if (kt) {
    try {
      return (await kt.getPassword(SERVICE, ref)) ?? memory.get(ref);
    } catch (err) {
      warnOnce(`keychain read failed — using in-memory secret store: ${errText(err)}`);
    }
  }
  return memory.get(ref);
}

export async function deleteSecret(ref: string): Promise<void> {
  const kt = await load();
  if (kt) {
    try {
      await kt.deletePassword(SERVICE, ref);
    } catch (err) {
      warnOnce(`keychain delete failed — using in-memory secret store: ${errText(err)}`);
    }
  }
  memory.delete(ref);
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
