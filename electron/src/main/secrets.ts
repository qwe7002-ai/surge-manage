/**
 * Thin wrapper over the OS keychain (keytar). Secrets (SSH passphrases,
 * passwords) are referenced from config by a `secretRef` string; the plaintext
 * never touches disk in our own files.
 *
 * keytar is a native module; if it fails to load (e.g. missing libsecret on a
 * headless Linux box) we fall back to an in-memory store so the app still runs,
 * logging a warning. Production builds should ship libsecret.
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
    if (!warned) {
      console.warn(
        "[secrets] keytar unavailable — falling back to in-memory secret store",
      );
      warned = true;
    }
    return null;
  }
}

export async function setSecret(ref: string, value: string): Promise<void> {
  const kt = await load();
  if (kt) await kt.setPassword(SERVICE, ref, value);
  else memory.set(ref, value);
}

export async function getSecret(ref: string): Promise<string | undefined> {
  const kt = await load();
  if (kt) return (await kt.getPassword(SERVICE, ref)) ?? undefined;
  return memory.get(ref);
}

export async function deleteSecret(ref: string): Promise<void> {
  const kt = await load();
  if (kt) await kt.deletePassword(SERVICE, ref);
  else memory.delete(ref);
}
