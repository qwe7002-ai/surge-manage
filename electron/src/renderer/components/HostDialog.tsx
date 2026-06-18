import { useEffect, useState, type ReactNode } from "react";
import type { AuthMethod, HostConfig } from "@surge-manage/shared";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApp } from "@/store/app-store";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: HostConfig | null;
}

interface FormState {
  label: string;
  host: string;
  port: string;
  username: string;
  auth: AuthMethod;
  privateKeyPath: string;
  surgeBin: string;
  configDir: string;
  secret: string;
}

function emptyForm(): FormState {
  return {
    label: "",
    host: "",
    port: "22",
    username: "root",
    auth: "key",
    privateKeyPath: "",
    surgeBin: "surge-cli",
    configDir: "",
    secret: "",
  };
}

function toForm(host: HostConfig): FormState {
  return {
    label: host.label,
    host: host.host,
    port: String(host.port),
    username: host.username,
    auth: host.auth,
    privateKeyPath: host.privateKeyPath ?? "",
    surgeBin: host.surge.bin,
    configDir: host.configDir ?? "",
    secret: "",
  };
}

export function HostDialog({ open, onOpenChange, initial }: Props) {
  const saveHost = useApp((s) => s.saveHost);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(initial ? toForm(initial) : emptyForm());
      setError(null);
    }
  }, [open, initial]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSave() {
    setSaving(true);
    setError(null);
    try {
      const id = initial?.id ?? crypto.randomUUID();
      const needsSecret = form.auth === "password" || (form.auth === "key" && !!form.secret);
      const secretRef = needsSecret ? `host:${id}` : undefined;

      if (secretRef && form.secret) {
        await window.surge.hosts.setSecret(secretRef, form.secret);
      }

      const host: HostConfig = {
        id,
        label: form.label.trim() || form.host,
        host: form.host.trim(),
        port: Number(form.port) || 22,
        username: form.username.trim(),
        auth: form.auth,
        privateKeyPath: form.auth === "key" ? form.privateKeyPath.trim() || undefined : undefined,
        secretRef,
        surge: { bin: form.surgeBin.trim() || "surge-cli" },
        configDir: form.configDir.trim() || undefined,
        createdAt: initial?.createdAt ?? Date.now(),
        lastConnectedAt: initial?.lastConnectedAt,
      };
      await saveHost(host);
      onOpenChange(false);
    } catch (e) {
      // Never leave the button looking dead: surface why the save failed.
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const valid = form.host.trim() && form.username.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit host" : "Add host"}</DialogTitle>
          <DialogDescription>
            Surge Manage connects over SSH and runs the surge CLI on this host.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <Field label="Label">
            <Input
              value={form.label}
              placeholder="Tokyo node"
              onChange={(e) => set("label", e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-[1fr_88px] gap-2">
            <Field label="Host">
              <Input
                value={form.host}
                placeholder="203.0.113.7"
                onChange={(e) => set("host", e.target.value)}
              />
            </Field>
            <Field label="Port">
              <Input
                value={form.port}
                inputMode="numeric"
                onChange={(e) => set("port", e.target.value)}
              />
            </Field>
          </div>
          <Field label="Username">
            <Input
              value={form.username}
              onChange={(e) => set("username", e.target.value)}
            />
          </Field>
          <Field label="Authentication">
            <Select
              value={form.auth}
              onValueChange={(v) => set("auth", v as AuthMethod)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="key">Private key</SelectItem>
                <SelectItem value="password">Password</SelectItem>
                <SelectItem value="agent">SSH agent</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {form.auth === "key" && (
            <>
              <Field label="Private key path">
                <Input
                  value={form.privateKeyPath}
                  placeholder="~/.ssh/id_ed25519"
                  onChange={(e) => set("privateKeyPath", e.target.value)}
                />
              </Field>
              <Field label="Key passphrase (optional)">
                <Input
                  type="password"
                  value={form.secret}
                  placeholder={initial?.secretRef ? "•••••• (unchanged)" : ""}
                  onChange={(e) => set("secret", e.target.value)}
                />
              </Field>
            </>
          )}

          {form.auth === "password" && (
            <Field label="Password">
              <Input
                type="password"
                value={form.secret}
                placeholder={initial?.secretRef ? "•••••• (unchanged)" : ""}
                onChange={(e) => set("secret", e.target.value)}
              />
            </Field>
          )}

          <Field label="Surge binary">
            <Input
              value={form.surgeBin}
              placeholder="surge-cli (or /Applications/Surge.app/Contents/Applications/surge-cli)"
              onChange={(e) => set("surgeBin", e.target.value)}
            />
          </Field>

          <Field label="Config directory (optional)">
            <Input
              value={form.configDir}
              placeholder="~/Library/Application Support/Surge/Profiles"
              onChange={(e) => set("configDir", e.target.value)}
            />
          </Field>
        </div>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button variant="ghost" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!valid || saving} onClick={() => void onSave()}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
